/**
 * Remote control handlers for music playback
 */

import { AudioPlayerStatus } from '@discordjs/voice';
import { InteractionResponseType } from 'discord-api-types/v10';
import { playbackcontrols } from '../../../ui/playback-controls.js';
import { resetVoiceTimeout } from '../../../ui/services/voice-timeout.js';

// Import required services and managers
let guildAudioSessions, checkModPermissions;

// Lazy load to avoid circular dependencies
async function getImports() {
    if (!guildAudioSessions) {
        console.log(`[RemoteControls] Loading imports...`);
        const audioState = await import('../../../utils/core/audio-state.js');
        const permissionMiddleware = await import('../../../middleware/permissionMiddleware.js');
        guildAudioSessions = audioState.guildAudioSessions;
        checkModPermissions = permissionMiddleware.checkModPermissions;
        console.log(`[RemoteControls] Imports loaded - guildAudioSessions:`, !!guildAudioSessions, 'checkModPermissions:', !!checkModPermissions);
    }
}

export async function handleRemotePlayPause(req, res, _data, djsClient) {
    await getImports();
    
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check mod permissions
    if (!await checkModPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need moderator permissions to use this control.',
                flags: 64
            }
        });
    }

    const session = guildAudioSessions.get(guildId);

    if (session?.player) {
        // Use state manager instead of hardcoded check
        const { playerStateManager } = await import('../../../utils/core/player-state-manager.js');
        const isPaused = playerStateManager.isPaused(guildId);
        
        if (isPaused) {
            session.player.unpause();
        } else {
            session.player.pause();
        }
    }

    // Reset voice timeout when user interacts with the bot
    resetVoiceTimeout(guildId, djsClient);

    // Store the playback controls message reference for volume updates
    if (session && req.body.message) {
        session.playbackControlsMessage = {
            messageId: req.body.message.id,
            channelId: req.body.message.channel_id
        };
        console.log(`[PlaybackControls] Stored playback controls message reference for guild ${guildId}:`, session.playbackControlsMessage);
    }

    // FIXED: Emit queue change event to update BOTH queue panel and chat message
    djsClient.emit('queueChanged', guildId, session);

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await playbackcontrols(guildId, djsClient)
    });
}

export async function handleRemoteSkip(req, res, _data, djsClient) {
    await getImports();
    
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check mod permissions
    if (!await checkModPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need moderator permissions to use this control.',
                flags: 64
            }
        });
    }

    if (!guildAudioSessions) {
        console.error(`[RemoteSkip] guildAudioSessions is still undefined after getImports()`);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error: Unable to access audio sessions.',
                flags: 64
            }
        });
    }

    const session = guildAudioSessions.get(guildId);
    if (session?.player) {
        session.player.stop();
    }

    // Reset voice timeout when user interacts with the bot
    resetVoiceTimeout(guildId, djsClient);

    // Store the playback controls message reference for volume updates
    if (session && req.body.message) {
        session.playbackControlsMessage = {
            messageId: req.body.message.id,
            channelId: req.body.message.channel_id
        };
        console.log(`[PlaybackControls] Stored playback controls message reference for guild ${guildId}:`, session.playbackControlsMessage);
    }

    // OPTIMIZATION: Don't manually emit queue change event here since the audio player events will handle it automatically
    // This prevents redundant updates and ensures proper queue progression
    console.log(`[RemoteSkip] Skipping manual queue change event - audio player events will handle it automatically`);

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await playbackcontrols(guildId, djsClient)
    });
}

export async function handleRemoteStop(req, res, _data, djsClient) {
    await getImports();
    
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check mod permissions
    if (!await checkModPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need moderator permissions to use this control.',
                flags: 64
            }
        });
    }

    const session = guildAudioSessions.get(guildId);
    if (session) {
        // Stop the player
        if (session.player) {
            session.player.stop();
        }

        // Store the playback controls message reference for volume updates
        if (req.body.message) {
            session.playbackControlsMessage = {
                messageId: req.body.message.id,
                channelId: req.body.message.channel_id
            };
            console.log(`[PlaybackControls] Stored playback controls message reference for guild ${guildId}:`, session.playbackControlsMessage);
        }

        // CRITICAL: Clean up all processes for this guild using ProcessManager
        try {
            const { processManager } = await import('../../../utils/services/process-manager.js');
            await processManager.killGuildProcesses(guildId);
            console.log(`[RemoteStop] Cleaned up all processes for guild ${guildId}`);
        } catch (processError) {
            console.warn(`[RemoteStop] Error cleaning up processes:`, processError.message);
        }

        // FIXED: Emit queue change event to update BOTH queue panel and chat message
        djsClient.emit('queueChanged', guildId, session);
    }

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await playbackcontrols(guildId, djsClient)
    });
}

export async function handleRemoteShuffle(req, res, _data, djsClient) {
    await getImports();
    
    try {
        console.log(`[Shuffle] 🎲 SHUFFLE COMMAND TRIGGERED for guild ${req.body.guild_id}`);
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id;

        // Check mod permissions
        if (!await checkModPermissions(djsClient, guildId, userId)) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ You need moderator permissions to use this control.',
                    flags: 64
                }
            });
        }

        // Import the working shuffle command
        const { handleShuffleCommand } = await import('../../commands/shuffle.js');
        
        // Call the working shuffle command but intercept the response
        const originalRes = res;
        let shuffleResponse = null;
        
        // Create a mock response object to capture the shuffle command's response
        const mockRes = {
            send: (data) => {
                shuffleResponse = data;
                return Promise.resolve();
            }
        };
        
        // Call the working shuffle command
        await handleShuffleCommand(req, mockRes, djsClient);
        
        // Return the playback controls update instead of the shuffle command's response
        return originalRes.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: await playbackcontrols(guildId, djsClient)
        });
        
    } catch (error) {
        console.error(`[Shuffle] ERROR in shuffle command:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error occurred while shuffling the queue.',
                flags: 64
            }
        });
    }
}

export async function handleRemoteVolumeUp(req, res, _data, djsClient) {
    await getImports();
    
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check mod permissions
    if (!await checkModPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need moderator permissions to use this control.',
                flags: 64
            }
        });
    }

    const session = guildAudioSessions.get(guildId);
    if (session) {
        const currentVolume = session.volume || 100;
        const newVolume = Math.min(currentVolume + 10, 200); // Increase by 10, max 200%
        
        const { applyVolumeToSession } = await import('../../common/audio-session.js');
        const success = await applyVolumeToSession(guildId, newVolume, false, djsClient);
        console.log(`[RemoteVolumeUp] Volume application result: ${success}`);
        
        // Reset voice timeout when user interacts with the bot
        resetVoiceTimeout(guildId, djsClient);
    }

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await playbackcontrols(guildId, djsClient)
    });
}

export async function handleRemoteVolumeDown(req, res, _data, djsClient) {
    await getImports();
    
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check mod permissions
    if (!await checkModPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need moderator permissions to use this control.',
                flags: 64
            }
        });
    }

    const session = guildAudioSessions.get(guildId);
    if (session) {
        const currentVolume = session.volume || 100;
        const newVolume = Math.max(currentVolume - 10, 0); // Decrease by 10, min 0%
        
        const { applyVolumeToSession } = await import('../../common/audio-session.js');
        const success = await applyVolumeToSession(guildId, newVolume, false, djsClient);
        console.log(`[RemoteVolumeDown] Volume application result: ${success}`);
        
        // Reset voice timeout when user interacts with the bot
        resetVoiceTimeout(guildId, djsClient);
    }

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await playbackcontrols(guildId, djsClient)
    });
}
