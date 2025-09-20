// commands/reset.js
import { InteractionResponseType } from 'discord-interactions';
import { getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { saveGuildQueue } from '../utils/database/guildQueues.js';
import { clearVoiceTimeout } from '../handlers/menu-component-handlers.js';
import { cleanupService } from '../utils/services/cleanup-service.js';
import { checkAdminPermissions } from '../middleware/permissionMiddleware.js';

export async function handleResetCommand(req, res, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    // Check admin permissions
    if (!await checkAdminPermissions(djsClient, guildId, userId)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ You need admin permissions to use this command.',
                flags: 64
            }
        });
    }

    try {
        console.log(`[Reset] Starting bot reset for guild ${guildId} by user ${userId}`);

        // 1. Disconnect from voice channel if connected
        const connection = getVoiceConnection(guildId);
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            console.log(`[Reset] Disconnecting from voice channel in guild ${guildId}`);
            // Use proper cleanup function
            const { destroyVoiceConnection } = await import('../handlers/common/audio-session.js');
            destroyVoiceConnection(connection, guildId);
        }

        // 2. Clear voice timeout
        clearVoiceTimeout(guildId);

        // 3. Clear audio session and queue
        const session = guildAudioSessions.get(guildId);
        if (session) {
            // CRITICAL: Use unified process cleanup instead of manual process management
            try {
                await cleanupService.cleanupGuildProcesses(guildId);
                console.log(`[ResetCommand] Cleaned up all processes for guild ${guildId} using unified system`);
            } catch (error) {
                console.error(`[ResetCommand] Error cleaning up processes:`, error.message);
            }
            
            // Stop audio player if it exists
            if (session.player) {
                session.player.stop(true);
            }

            // Delete persistent queue message if it exists
            if (session.queueMessage && session.queueMessage.messageId) {
                try {
                    const channel = await djsClient.channels.fetch(session.queueMessage.channelId);
                    if (channel && channel.isTextBased()) {
                        await channel.messages.delete(session.queueMessage.messageId);
                        console.log(`[Reset] Deleted persistent queue message ${session.queueMessage.messageId} for guild ${guildId}`);
                    }
                } catch (error) {
                    console.error(`[Reset] Error deleting queue message for guild ${guildId}:`, error.message);
                }
            }

            // Clear any active queue processing messages
            if (session.lastQueueProcessingMessage) {
                session.lastQueueProcessingMessage = null;
            }

            // Remove session from global state
            guildAudioSessions.delete(guildId);
        }

        // 5. Save empty state to database
        await saveGuildQueue(guildId, { 
            nowPlaying: null, 
            queue: [], 
            history: [], 
            lazyLoadInfo: null 
        });

        // 6. Clear any panel messages if they exist
        try {
            const { getPanelInfo } = await import('../utils/database/panels.js');
            const panelInfo = await getPanelInfo(guildId);
            if (panelInfo && panelInfo.messageId && panelInfo.channelId) {
                try {
                    const channel = await djsClient.channels.fetch(panelInfo.channelId);
                    if (channel && channel.isTextBased()) {
                        await channel.messages.delete(panelInfo.messageId);
                        console.log(`[Reset] Deleted panel message ${panelInfo.messageId} for guild ${guildId}`);
                    }
                } catch (error) {
                    console.error(`[Reset] Error deleting panel message for guild ${guildId}:`, error.message);
                }
            }
        } catch (error) {
            console.error(`[Reset] Error checking panel info for guild ${guildId}:`, error.message);
        }

        console.log(`[Reset] Successfully reset bot state for guild ${guildId}`);

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '✅ **Bot Reset Complete!**\n\n🔄 All bot state has been cleared:\n• Disconnected from voice channels\n• Cleared music queue and playback\n• Stopped all audio processes\n• Reset all timers and sessions\n\nThe bot is now in a fresh state and ready to use.',
                flags: 64
            }
        });

    } catch (error) {
        console.error(`[Reset] Error resetting bot for guild ${guildId}:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ An error occurred while resetting the bot. Please try again or contact support if the issue persists.',
                flags: 64
            }
        });
    }
}
