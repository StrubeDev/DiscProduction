// commands/stop.js
import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js'; // Needs access to sessions
import { AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import { updatePersistentQueueMessage, cleanupQueueMessageOnSessionEnd } from '../utils/helpers/message-helpers.js';
import fetch from 'node-fetch';
import { clearVoiceTimeout, startOrResetVoiceTimeout } from '../handlers/menu-component-handlers.js';
import { cleanupService } from '../utils/services/cleanup-service.js';
import { playerStateManager } from '../utils/core/player-state-manager.js';
import { ErrorMessages } from '../errors/index.js';

export async function handleStopCommand(req, res, djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    let feedbackMessage = "";

    if (!session || !session.player) {
        feedbackMessage = '❌ Nothing to stop. The bot is not currently active in this server.';
    } else {
        const playerStatus = session.player.state.status;
        const wasActive = playerStatus === AudioPlayerStatus.Playing ||
                          playerStatus === AudioPlayerStatus.Buffering ||
                          playerStatus === AudioPlayerStatus.Paused;

        if (!wasActive && !playerStateManager.getNowPlaying(guildId) && session.queue.length === 0 && !session.lazyLoadInfo) { // Added check for lazyLoadInfo
            feedbackMessage = '❌ Nothing is playing and the queue is already empty.';
        } else {
            // --- Start of Corrected Logic ---

            // Clear the standard queue
            session.queue = [];
            console.log(`[StopCmd] Queue cleared for guild ${guildId}.`);

            // **NEW:** Clear the lazy loading information if it exists
            if (session.lazyLoadInfo) {
                session.lazyLoadInfo = null;
                console.log(`[StopCmd] Lazy load session info cleared for guild ${guildId}.`);
            }

            // Stop the player (this will also trigger the Idle state)
            session.player.stop(true);
            console.log(`[StopCmd] Player stopped for guild ${guildId}.`);

            // Clear nowPlaying information
            playerStateManager.clearNowPlaying(guildId);

            // COMPREHENSIVE CLEANUP: Clear all temp files when stopping
            try {
                const { cleanupSessionTempFiles } = await import('../handlers/menu-component-handlers.js');
                await cleanupSessionTempFiles(guildId, session);
            } catch (cleanupError) {
                console.error(`[StopCmd] Error during temp file cleanup:`, cleanupError.message);
            }

            // CRITICAL: Clear database queue to prevent old songs from being loaded
            try {
                const { saveGuildQueue } = await import('../utils/database/guildQueues.js');
                await saveGuildQueue(guildId, { 
                    nowPlaying: null, 
                    queue: [], 
                    history: session?.history || [], 
                    lazyLoadInfo: null 
                });
                console.log(`[StopCmd] ✅ Cleared database queue for guild ${guildId}`);
            } catch (dbError) {
                console.error(`[StopCmd] Error clearing database queue:`, dbError.message);
            }

            feedbackMessage = '⏹️ Playback stopped and queue cleared.';

            // --- End of Corrected Logic ---
        }
    }

    // Disconnect from voice channel regardless of player state, if connected
    const connection = getVoiceConnection(guildId);
    if (connection) {
        connection.destroy();
        clearVoiceTimeout(guildId);
        console.log(`[StopCmd] Bot disconnected from voice channel in guild ${guildId}.`);
        if (feedbackMessage.startsWith('❌ Nothing to stop') || feedbackMessage.startsWith('❌ Nothing is playing')) {
             // If there was nothing playing but bot was in VC
            feedbackMessage = '🤖 Bot disconnected from voice channel.';
        } else {
            feedbackMessage += ' Bot disconnected.';
        }
    } else {
        // Bot is not in voice channel, but we should still handle timeout if there's a session
        if (session) {
            clearVoiceTimeout(guildId);
            // Start timeout since bot is not in VC and no music is playing
            startOrResetVoiceTimeout(guildId, null);
        }
        if (feedbackMessage === "") { // If no session and no connection
             feedbackMessage = `❌ ${ErrorMessages.SESSION_2007} and no active session found.`;
        }
    }
    
    // If a session existed, update it and clean up properly
    if (session) {
        // CRITICAL: Use unified process cleanup instead of manual process management
        try {
            await cleanupService.cleanupGuildProcesses(guildId);
            console.log(`[StopCommand] Cleaned up all processes for guild ${guildId} using unified system`);
        } catch (error) {
            console.error(`[StopCommand] Error cleaning up processes:`, error.message);
        }
        
        // CLEANUP: Map cleanup is now handled by streamlined cleanup system
        
        // FIXED: Use the new cleanup function for better queue message handling
        await cleanupQueueMessageOnSessionEnd(guildId, djsClient, session);
        
        // Clear all session data to prevent queue duplication
        session.queue = [];
        session.history = [];
        playerStateManager.clearNowPlaying(guildId);
        session.lazyLoadInfo = null;
        playerStateManager.setLoading(guildId, false);
        session.currentSongEndedWithError = false;
        
        // CRITICAL: Also clear database queue in session cleanup to ensure complete cleanup
        try {
            const { saveGuildQueue } = await import('../utils/database/guildQueues.js');
            await saveGuildQueue(guildId, { 
                nowPlaying: null, 
                queue: [], 
                history: session.history || [], 
                lazyLoadInfo: null 
            });
            console.log(`[StopCmd] ✅ Session cleanup: Cleared database queue for guild ${guildId}`);
        } catch (dbError) {
            console.error(`[StopCmd] Error clearing database queue in session cleanup:`, dbError.message);
        }
        
        // Update the session in the map so the timeout function sees the correct state
        guildAudioSessions.set(guildId, session);
        
        // Start timeout after session state is updated (if bot is not in VC)
        if (!connection) {
            startOrResetVoiceTimeout(guildId, null);
        }
        
        // Clear any active queue processing messages by sending an "inactive" message
        if (session.lastQueueProcessingMessage) {
            try {
                const { applicationId, interactionToken } = session.lastQueueProcessingMessage;
                const apiUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
                
                
                console.log(`[StopCmd] Updated queue processing message to inactive for guild ${guildId}`);
            } catch (error) {
                console.error(`[StopCmd] Error updating queue processing message for guild ${guildId}:`, error.message);
            }
            // Clear the reference
            session.lastQueueProcessingMessage = null;
        }
        
        // CLEAR PLAYBACK CONTROLS EMBED when playback stops
        try {
            const { clearPlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
            await clearPlaybackControlsEmbed(guildId, djsClient);
        } catch (error) {
            console.error('[StopCommand] Error clearing playback controls embed:', error.message);
        }
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: feedbackMessage,
            flags: 64 // MODIFY THIS: Make ALL messages ephemeral, not just error messages
        },
    });
}