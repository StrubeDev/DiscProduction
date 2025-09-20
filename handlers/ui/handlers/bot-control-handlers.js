/**
 * Bot control handlers
 * Handles bot voice channel and configuration interactions
 */

import { InteractionResponseType } from 'discord-api-types/v10';
import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { checkBotControlsPermissions } from '../../../middleware/permissionMiddleware.js';
import { getGuildSettings, updateGuildSettings } from '../../../utils/database/guildSettings.js';
import { getBotVoiceControlsPageData } from '../../../ui/pages/bot-voice-controls.js';
import { ErrorMessages } from '../../../errors/index.js';

// Import required services and managers
let guildAudioSessions, guildQueueDisplayPreference, configuredBotVoiceChannels, guildTimeouts;

// Lazy load to avoid circular dependencies
async function getImports() {
    if (!guildAudioSessions) {
        const audioSession = await import('../../common/audio-session.js');
        guildAudioSessions = audioSession.guildAudioSessions;
        guildQueueDisplayPreference = audioSession.guildQueueDisplayPreference;
        configuredBotVoiceChannels = audioSession.configuredBotVoiceChannels;
        guildTimeouts = audioSession.guildTimeouts;
    }
}

/**
 * Handle bot voice channel configuration navigation
 */
export async function handleMenuNavBotVoiceControls(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to access this menu.',
                flags: 64
            }
        });
    }

    const pageData = await getBotVoiceControlsPageData(guildId, djsClient);
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: pageData });
}

/**
 * Handle joining configured voice channel
 */
export async function handleBotJoinVC(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    await getImports();
    const joinResult = await attemptToJoinConfiguredVC(guildId, djsClient);
    const feedbackMessage = joinResult.message;

    const refreshedPageData = await getBotVoiceControlsPageData(guildId, djsClient);
    if (refreshedPageData.embeds && refreshedPageData.embeds[0]) {
        const originalDescription = refreshedPageData.embeds[0].description || '';
        refreshedPageData.embeds[0].description = `${feedbackMessage}\n\n${originalDescription}`.trim();
    } else { 
        refreshedPageData.content = feedbackMessage; 
    }
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: refreshedPageData });
}

/**
 * Handle disconnecting from voice channel
 */
export async function handleBotDisconnectVC(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    let feedbackMessage = "Could not process disconnect.";
    const connection = getVoiceConnection(guildId);
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        // Use proper cleanup function
        const { destroyVoiceConnection } = await import('../../common/audio-session.js');
        destroyVoiceConnection(connection, guildId);
        clearVoiceTimeout(guildId);
        feedbackMessage = "Bot disconnected.";
        
        await getImports();
        const currentSession = guildAudioSessions.get(guildId);
        if (currentSession) {
            // Delete the persistent queue message if it exists
            if (currentSession.queueMessage && currentSession.queueMessage.messageId) {
                try {
                    const channel = await djsClient.channels.fetch(currentSession.queueMessage.channelId);
                    if (channel && channel.isTextBased()) {
                        await channel.messages.delete(currentSession.queueMessage.messageId);
                        console.log(`[BotDisconnectVC] Deleted persistent queue message ${currentSession.queueMessage.messageId} for guild ${guildId}`);
                    }
                } catch (error) {
                    console.error(`[BotDisconnectVC] Error deleting queue message for guild ${guildId}:`, error.message);
                }
            }

            currentSession.nowPlaying = null;
            currentSession.queue = [];
            guildAudioSessions.delete(guildId);
            
            // Save empty state to database
            const { saveGuildQueue } = await import('../../../utils/database/guildQueues.js');
            await saveGuildQueue(guildId, { nowPlaying: null, queue: [], history: currentSession.history || [] });
        }
    } else {
        feedbackMessage = ErrorMessages.SESSION_2007;
    }

    const refreshedPageData = await getBotVoiceControlsPageData(guildId, djsClient);
    if (refreshedPageData.embeds && refreshedPageData.embeds[0]) {
        const originalDescription = refreshedPageData.embeds[0].description || '';
        refreshedPageData.embeds[0].description = `${feedbackMessage}\n\n${originalDescription}`.trim();
    } else { 
        refreshedPageData.content = feedbackMessage; 
    }
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: refreshedPageData });
}

/**
 * Handle voice channel selection configuration
 */
export async function handleBotVCSelectConfig(req, res, data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    const selectedChannelId = data.values[0];
    let feedbackMessage;

    try {
        const channel = await djsClient.channels.fetch(selectedChannelId);
        if (channel && channel.type === ChannelType.GuildVoice) {
            await getImports();
            configuredBotVoiceChannels.set(guildId, selectedChannelId);

            // Save to database so it persists across restarts
            const currentSettings = await getGuildSettings(guildId);
            currentSettings.voice_channel_id = selectedChannelId;
            await updateGuildSettings(guildId, currentSettings);

            feedbackMessage = `✅ Bot's voice channel set to: **${channel.name}**.`;
        } else {
            feedbackMessage = "❌ Selected item is not a valid voice channel.";
        }
    } catch (error) {
        console.error("Error setting voice channel:", error);
        feedbackMessage = "❌ There was an error setting the voice channel.";
    }

    // Refresh the page the user is actually on ("Config")
    const refreshedPageData = await getBotVoiceControlsPageData(guildId, djsClient);

    // Prepend the feedback message to the description of the correct page's embed.
    if (refreshedPageData.embeds && refreshedPageData.embeds[0]) {
        const originalDescription = 'Manage the bot\'s voice channel connection and settings.';
        refreshedPageData.embeds[0].description = `${feedbackMessage}\n\n${originalDescription}`;
    } else {
        refreshedPageData.content = feedbackMessage;
    }

    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: refreshedPageData });
}

/**
 * Handle queue display preference changes
 */
export async function handleSetQueueDisplayPreference(req, res, _data, djsClient, newPreference) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    await getImports();
    const oldPreference = guildQueueDisplayPreference.get(guildId) || 'chat';
    guildQueueDisplayPreference.set(guildId, newPreference);

    const currentSettings = await getGuildSettings(guildId);
    currentSettings.queue_display_mode = newPreference;
    await updateGuildSettings(guildId, currentSettings);

    let feedbackMessage = `Queue display preference set to: ${newPreference === 'menu' ? 'Bot Menu' : 'Chat Message'}.`;
    const session = guildAudioSessions.get(guildId);

    if (oldPreference === 'chat' && newPreference === 'menu') {
        // Switching from chat to menu mode
        if (session && session.queueMessage && session.queueMessage.messageId && session.queueMessage.channelId) {
            try {
                const channel = await djsClient.channels.fetch(session.queueMessage.channelId);
                await channel.messages.delete(session.queueMessage.messageId);
                feedbackMessage += "\nCleared old chat queue message.";
                session.queueMessage = null;
                guildAudioSessions.set(guildId, session);
                
                // Get existing history from database before saving
                const { getGuildQueue, saveGuildQueue } = await import('../../../utils/database/guildQueues.js');
                const existingData = await getGuildQueue(guildId);
                await saveGuildQueue(guildId, {
                    nowPlaying: session.nowPlaying,
                    queue: session.queue,
                    history: existingData?.history || []
                });
            } catch (e) {
                console.warn(`[Toggle] Could not delete old queue message ${session.queueMessage.messageId}:`, e.message);
                feedbackMessage += "\nCould not clear old chat queue message.";
            }
        }
    } else if (oldPreference === 'menu' && newPreference === 'chat') {
        // Switching from menu to chat mode
        if (session && (session.nowPlaying || (session.queue && session.queue.length > 0))) {
            try {
                const { updatePersistentQueueMessage } = await import('../../../utils/helpers/message-helpers.js');
                // Force create a new chat message when switching to chat mode
                await updatePersistentQueueMessage(guildId, djsClient, session, true);
                feedbackMessage += "\nQueue now visible in chat.";
            } catch (e) {
                console.warn(`[Toggle] Could not create chat queue message:`, e.message);
                feedbackMessage += "\nCould not create chat queue message.";
            }
        }
    }

    const refreshedPageData = await getBotVoiceControlsPageData(guildId, djsClient);
    if (refreshedPageData.embeds && refreshedPageData.embeds[0]) {
        const originalDescription = 'Manage the bot\'s voice channel connection and settings.';
        refreshedPageData.embeds[0].description = `${feedbackMessage}\n\n${originalDescription}`.trim();
    } else { 
        refreshedPageData.content = feedbackMessage; 
    }
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: refreshedPageData });
}

export const handleSetQueueDisplayMenu = (req, res, _data, djsClient) =>
    handleSetQueueDisplayPreference(req, res, _data, djsClient, 'menu');

export const handleSetQueueDisplayChat = (req, res, _data, djsClient) =>
    handleSetQueueDisplayPreference(req, res, _data, djsClient, 'chat');


/**
 * Attempt to join the configured voice channel
 */
async function attemptToJoinConfiguredVC(guildId, djsClient) {
    if (!djsClient || !djsClient.guilds) {
        return { success: false, message: "Bot's audio client is not ready." };
    }
    
    await getImports();
    
    // Attempt to load from DB if not in memory
    if (!configuredBotVoiceChannels.has(guildId)) {
        const settings = await getGuildSettings(guildId);
        if (settings && settings.voice_channel_id) {
            configuredBotVoiceChannels.set(guildId, settings.voice_channel_id);
        }
    }

    const targetChannelId = configuredBotVoiceChannels.get(guildId);
    if (!targetChannelId) {
        return { success: false, message: "No voice channel configured. Use the menu to set one." };
    }

    try {
        const guild = await djsClient.guilds.fetch(guildId);
        const voiceChannel = await guild.channels.fetch(targetChannelId);
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            configuredBotVoiceChannels.delete(guildId);
            return { success: false, message: "Configured channel is not a valid voice channel. Please reconfigure." };
        }

        const botUserId = djsClient.user?.id || process.env.BOT_USER_ID;
        const botMember = await guild.members.fetch(botUserId);
        const permissions = voiceChannel.permissionsFor(botMember);
        if (!permissions || !permissions.has(PermissionFlagsBits.Connect)) {
            return { success: false, message: `I lack permission to connect to ${voiceChannel.name}.` };
        }
        if (!permissions.has(PermissionFlagsBits.Speak)) {
            return { success: false, message: `I lack permission to speak in ${voiceChannel.name}.` };
        }

        const existingConnection = getVoiceConnection(guildId);
        if (existingConnection && existingConnection.state.status !== VoiceConnectionStatus.Destroyed) {
            if (existingConnection.joinConfig.channelId === voiceChannel.id) {
                return { success: true, message: `Already in ${voiceChannel.name}.` };
            }
            return { success: false, message: "Bot is in another voice channel. Disconnect it first." };
        }

        console.log(`[VoiceJoin] Attempting to join voice channel ${voiceChannel.name} (${voiceChannel.id}) in guild ${guildId}`);
        
        const { joinVoiceChannel } = await import('@discordjs/voice');
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        console.log(`[VoiceJoin] Voice connection created for guild ${guildId}, status: ${connection.state.status}`);
        
        // Wait a moment for the connection to stabilize
        console.log(`[VoiceJoin] Waiting for connection to stabilize...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`[VoiceJoin] Connection status after stabilization: ${connection.state.status}`);
        
        if (connection.state.status === VoiceConnectionStatus.Destroyed) {
            console.log(`[VoiceJoin] ⚠️ Connection was destroyed during stabilization for guild ${guildId}`);
            return { success: false, message: 'Connection failed to establish properly.' };
        }

        // Start voice timeout
        const { startOrResetVoiceTimeout } = await import('../services/voice-timeout.js');
        await startOrResetVoiceTimeout(guildId, djsClient);

        return { success: true, message: `Joining ${voiceChannel.name}...`, connection };

    } catch (error) {
        console.error('Error joining configured VC:', error);
        if (error.code === 10003) configuredBotVoiceChannels.delete(guildId);
        return { success: false, message: 'Error joining configured VC. It might have been deleted.' };
    }
}

/**
 * Handle timeout modal submission
 */
export async function handleSubmitTimeoutModal(req, res, data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;
    
    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    try {
        const timeoutMinutes = parseInt(data.components[0].components[0].value);
        
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Please enter a valid timeout between 1 and 60 minutes.',
                    flags: 64
                }
            });
        }

        // Update guild settings
        const currentSettings = await getGuildSettings(guildId);
        currentSettings.voice_timeout_minutes = timeoutMinutes;
        await updateGuildSettings(guildId, currentSettings);

        // Update in-memory map
        await getImports();
        guildTimeouts.set(guildId, timeoutMinutes);

        return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
    } catch (error) {
        console.error('[TimeoutModal] Error:', error);
        return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
    }
}

/**
 * Handle duration modal submission
 */
export async function handleSubmitDurationModal(req, res, data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;
    
    // Check config permissions
    if (!await checkBotControlsPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need config permissions to use this control.',
                flags: 64
            }
        });
    }

    try {
        const durationSeconds = parseInt(data.components[0].components[0].value);
        
        if (isNaN(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Please enter a valid duration between 1 and 3600 seconds.',
                    flags: 64
                }
            });
        }

        // Update guild settings
        const currentSettings = await getGuildSettings(guildId);
        currentSettings.max_song_duration_seconds = durationSeconds;
        await updateGuildSettings(guildId, currentSettings);

        return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
    } catch (error) {
        console.error('[DurationModal] Error:', error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error setting duration. Please try again.',
                flags: 64
            }
        });
    }
}

/**
 * Clear voice timeout helper
 */
async function clearVoiceTimeout(guildId) {
    const { clearVoiceTimeout } = await import('../services/voice-timeout.js');
    return clearVoiceTimeout(guildId);
}
