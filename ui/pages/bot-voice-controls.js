/**
 * Bot voice controls page and related functions
 */

import { getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { ChannelType } from 'discord.js';
import { getGuildSettings } from '../../utils/database/guildSettings.js';

// Import required services and managers
let guildAudioSessions, guildQueueDisplayPreference, configuredBotVoiceChannels, guildTimeouts;

// Lazy load to avoid circular dependencies
async function getImports() {
    if (!guildAudioSessions) {
        const audioSession = await import('../../handlers/common/audio-session.js');
        guildAudioSessions = audioSession.guildAudioSessions;
        guildQueueDisplayPreference = audioSession.guildQueueDisplayPreference;
        configuredBotVoiceChannels = audioSession.configuredBotVoiceChannels;
        guildTimeouts = audioSession.guildTimeouts;
    }
}

export async function getBotVoiceControlsPageData(guildId, djsClient) {
    await getImports();
    
    const settings = await getGuildSettings(guildId);
    if (settings.queue_display_mode) {
        guildQueueDisplayPreference.set(guildId, settings.queue_display_mode);
    }
    if (settings.voice_channel_id) {
        configuredBotVoiceChannels.set(guildId, settings.voice_channel_id);
    }
    if (settings.voice_timeout_minutes) {
        guildTimeouts.set(guildId, settings.voice_timeout_minutes);
    }

    const currentQueuePref = guildQueueDisplayPreference.get(guildId) || 'chat';
    const connection = getVoiceConnection(guildId);
    const isConnected = connection && connection.state.status !== VoiceConnectionStatus.Destroyed;

    let botStatus = "Bot is not currently in a voice channel.";
    if (isConnected && connection.joinConfig.channelId) {
        try {
            const channel = await djsClient.channels.fetch(connection.joinConfig.channelId);
            botStatus = `Bot is currently in: **${channel.name}**`;
        } catch (error) {
            botStatus = "Bot is connected, but channel name could not be fetched.";
        }
    }

    const configuredChannelId = configuredBotVoiceChannels.get(guildId);
    let configuredChannelInfo = "Not yet configured. Use the dropdown below.";
    if (configuredChannelId && djsClient) {
        try {
            const channel = await djsClient.channels.fetch(configuredChannelId);
            if (channel && channel.type === ChannelType.GuildVoice) {
                configuredChannelInfo = `Currently set to: **${channel.name}**`;
            } else {
                configuredBotVoiceChannels.delete(guildId);
                configuredChannelInfo = `Invalid channel selected. Please reselect.`;
            }
        } catch { 
            configuredChannelInfo = `Error fetching configured channel. May have been deleted.`; 
        }
    }

    let timeoutInfo = "Not set.";
    const currentTimeout = guildTimeouts.get(guildId);
    if (typeof currentTimeout !== 'undefined') {
        timeoutInfo = currentTimeout > 0 ? `${currentTimeout} minutes` : "Disabled";
    }

    // Get max duration setting
    let maxDurationInfo = "No limit (default)";
    if (settings.max_duration_seconds !== null && settings.max_duration_seconds !== undefined) {
        if (settings.max_duration_seconds === 0) {
            maxDurationInfo = "No limit";
        } else {
            const minutes = Math.floor(settings.max_duration_seconds / 60);
            const seconds = settings.max_duration_seconds % 60;
            if (minutes > 0) {
                maxDurationInfo = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} minutes`;
            } else {
                maxDurationInfo = `${seconds} seconds`;
            }
        }
    }

    return {
        embeds: [
            {
                title: ' Config',
                description: 'Manage the bot\'s voice channel connection and settings.',
                color: 0x506098,
                fields: [
                    { name: 'Current Status', value: botStatus, inline: false },
                    { name: ' Designated Channel', value: configuredChannelInfo, inline: false },
                    { name: '⏱️ Auto-Disconnect', value: timeoutInfo, inline: false },
                    { name: ' Queue Display Mode', value: `Currently: ${currentQueuePref === 'menu' ? 'Bot Menu' : 'Chat Message'}`, inline: false },
                    { name: '⏰ Max Song Duration', value: maxDurationInfo, inline: false },
                ],
            },
        ],
        components: [
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.CHANNEL_SELECT,
                        custom_id: 'bot_vc_select_config',
                        placeholder: 'Select bot\'s voice channel',
                        channel_types: [ChannelType.GuildVoice]
                    }
                ]
            },
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'bot_join_vc',
                        label: 'Join Configured VC',
                        style: ButtonStyleTypes.SECONDARY,
                        emoji: { name: '🔊' },
                        disabled: isConnected || !configuredChannelId,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'bot_disconnect_vc',
                        label: 'Disconnect',
                        style: ButtonStyleTypes.DANGER,
                        emoji: { name: '🔇' },
                        disabled: !isConnected,
                    }
                ]
            },
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'set_timeout_modal',
                        label: 'Set Auto-Disconnect',
                        style: ButtonStyleTypes.SECONDARY,
                        emoji: { name: '⏱️' }
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'set_duration_modal',
                        label: 'Set Max Duration',
                        style: ButtonStyleTypes.SECONDARY,
                        emoji: { name: '⏰' }
                    }
                ]
            },
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'menu_nav_features',
                        label: 'Back to Features',
                        style: ButtonStyleTypes.SECONDARY,
                        emoji: { name: '↩' }
                    }
                ]
            }
        ],
    };
}
