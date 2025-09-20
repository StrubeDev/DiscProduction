/**
 * Voice Timeout Utilities
 * Manages bot disconnection timers and timeout settings
 */

import { getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { getGuildSettings, updateGuildSettings } from '../database/guildSettings.js';

// Maps for tracking voice timeouts
export const guildTimeouts = new Map(); // guildId -> timeoutInMinutes
const activeVoiceTimers = new Map(); // guildId -> NodeJS.Timeout object

export function clearVoiceTimeout(guildId) {
    if (activeVoiceTimers.has(guildId)) {
        clearTimeout(activeVoiceTimers.get(guildId));
        activeVoiceTimers.delete(guildId);
        console.log(`[VoiceTimeout] Cleared voice timeout for guild ${guildId}`);
    } else {
        console.log(`[VoiceTimeout] No active timeout to clear for guild ${guildId}`);
    }
    console.log(`[VoiceTimeout] clearVoiceTimeout: activeVoiceTimers.size = ${activeVoiceTimers.size}`);
}

export function resetVoiceTimeout(guildId, djsClient) {
    // Clear existing timeout and start a new one
    console.log(`[VoiceTimeout] Resetting voice timeout for guild ${guildId}`);
    console.log(`[VoiceTimeout] Stack trace:`, new Error().stack.split('\n').slice(1, 4).join('\n'));
    clearVoiceTimeout(guildId);
    startOrResetVoiceTimeout(guildId, djsClient);
    console.log(`[VoiceTimeout] Reset voice timeout for guild ${guildId}`);
}

export async function startOrResetVoiceTimeout(guildId, _djsClient) {
    console.log(`[VoiceTimeout] startOrResetVoiceTimeout called for guild ${guildId}`);
    clearVoiceTimeout(guildId);
    let timeoutMinutes = guildTimeouts.get(guildId);
    console.log(`[VoiceTimeout] guildTimeouts.get(${guildId}) = ${timeoutMinutes}`);
    
    // Always try to reload from database to get latest settings (in case they were updated)
    try {
        const settings = await getGuildSettings(guildId);
        const dbTimeout = settings.voice_timeout_minutes;
        if (dbTimeout !== undefined && dbTimeout !== null) {
            timeoutMinutes = dbTimeout;
            guildTimeouts.set(guildId, timeoutMinutes);
            console.log(`[VoiceTimeout] Updated timeout from database for guild ${guildId}: ${timeoutMinutes} minutes`);
        }
    } catch (error) {
        console.warn(`[VoiceTimeout] Could not reload timeout from database: ${error.message}`);
    }
    
    // Fallback to default timeout if still none is set
    if (timeoutMinutes === undefined || timeoutMinutes === null) {
        try {
            // Try to reload from database in case settings were updated
            const settings = await getGuildSettings(guildId);
            timeoutMinutes = settings.voice_timeout_minutes || 5; // Use database value or default to 5
            guildTimeouts.set(guildId, timeoutMinutes);
            console.log(`[VoiceTimeout] Reloaded timeout from database for guild ${guildId}: ${timeoutMinutes} minutes`);
        } catch (error) {
            timeoutMinutes = 5; // Default to 5 minutes
            guildTimeouts.set(guildId, timeoutMinutes);
            console.log(`[VoiceTimeout] Set fallback timeout for guild ${guildId}: ${timeoutMinutes} minutes`);
        }
        
        // Also try to save this to the database for future use
        try {
            const currentSettings = await getGuildSettings(guildId);
            currentSettings.voice_timeout_minutes = timeoutMinutes;
            await updateGuildSettings(guildId, currentSettings);
            console.log(`[VoiceTimeout] Saved fallback timeout to database for guild ${guildId}`);
        } catch (error) {
            console.warn(`[VoiceTimeout] Could not save fallback timeout to database for guild ${guildId}:`, error.message);
        }
    }

    console.log(`[VoiceTimeout] Debug: timeoutMinutes = ${timeoutMinutes}, type = ${typeof timeoutMinutes}, > 0 = ${timeoutMinutes > 0}`);
    if (timeoutMinutes && timeoutMinutes > 0) {
        const connection = getVoiceConnection(guildId);
        console.log(`[VoiceTimeout] Debug: connection = ${connection ? 'exists' : 'null'}, status = ${connection?.state?.status}`);
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            console.log(`[VoiceTimeout] Starting voice timeout for guild ${guildId}: ${timeoutMinutes} minutes`);
            console.log(`[VoiceTimeout] Timeout value loaded: ${timeoutMinutes} (type: ${typeof timeoutMinutes})`);
            
            // Import required modules dynamically to avoid circular dependencies
            const { guildAudioSessions } = await import('../core/audio-state.js');
            
            console.log(`[VoiceTimeout] Current session state:`, {
                hasSession: guildAudioSessions.has(guildId),
                nowPlaying: guildAudioSessions.get(guildId)?.nowPlaying ? 'YES' : 'NO',
                queueLength: guildAudioSessions.get(guildId)?.queue?.length || 0
            });
            console.log(`[VoiceTimeout] Setting timer for ${timeoutMinutes * 60 * 1000}ms (${timeoutMinutes} minutes)`);
            const timer = setTimeout(async () => {
                console.log(`[VoiceTimeout] ⏰ TIMEOUT TRIGGERED for guild ${guildId} after ${timeoutMinutes} minutes!`);
                console.log(`[VoiceTimeout] Voice timeout reached for guild ${guildId}. Checking if users are present...`);
                
                // Check if there are any users in the voice channel before disconnecting
                try {
                    const currentConnection = getVoiceConnection(guildId);
                    if (currentConnection && currentConnection.state.status !== VoiceConnectionStatus.Destroyed) {
                        const channel = await _djsClient.channels.fetch(currentConnection.joinConfig.channelId);
                        if (channel && channel.members) {
                            // Count non-bot members in the voice channel
                            const nonBotMembers = channel.members.filter(member => !member.user.bot);
                            console.log(`Voice timeout reached for guild ${guildId}. Users present: ${nonBotMembers.size}`);
                        }
                        
                        // SAFETY CHECK: Verify that music is actually not playing before disconnecting
                        const safetySession = guildAudioSessions.get(guildId);
                        if (safetySession && safetySession.player && safetySession.player.state && 
                            (safetySession.player.state.status === 'playing' || safetySession.player.state.status === 'buffering')) {
                            console.log(`[VoiceTimeout] ⚠️ SAFETY CHECK FAILED: Music is still playing (${safetySession.player.state.status}), cancelling timeout for guild ${guildId}`);
                            return; // Don't disconnect if music is actually playing
                        }
                        
                        // FIXED: Always disconnect when timeout is reached, regardless of user presence
                        // The timeout is for when no music is playing, not when no users are present
                        console.log(`Voice timeout reached for guild ${guildId}. Disconnecting due to inactivity.`);
                        currentConnection.destroy();
                        console.log(`Bot auto-disconnected from guild ${guildId} due to timeout.`);

                        // Clean up session and queue message
                        const currentSession = guildAudioSessions.get(guildId);
                        if (currentSession) {
                            // Clean up queue message if it exists
                            if (currentSession.queueMessage && currentSession.queueMessage.messageId) {
                                try {
                                    const channel = await _djsClient.channels.fetch(currentSession.queueMessage.channelId);
                                    if (channel && channel.isTextBased()) {
                                        await channel.messages.delete(currentSession.queueMessage.messageId);
                                        console.log(`[VoiceTimeout] Deleted queue message ${currentSession.queueMessage.messageId} for guild ${guildId}`);
                                    }
                                } catch (error) {
                                    console.error(`[VoiceTimeout] Error deleting queue message for guild ${guildId}:`, error.message);
                                }
                            }

                            // Clear session data arrays
                            currentSession.queue = [];
                            currentSession.history = [];
                            currentSession.lazyLoadInfo = null;
                            currentSession.queueMessage = null;
                            currentSession.currentSongEndedWithError = false;

                            // Remove session from global state
                            guildAudioSessions.delete(guildId);

                            // Save empty state to database
                            const { saveGuildQueue } = await import('../database/guildQueues.js');
                            await saveGuildQueue(guildId, { nowPlaying: null, queue: [], history: [], lazyLoadInfo: null });

                            console.log(`[VoiceTimeout] Session ${guildId} completely cleaned up and removed due to timeout`);
                        }
                    }
                } catch (error) {
                    console.error(`[VoiceTimeout] Error checking voice channel members for guild ${guildId}:`, error.message);
                }
                
                activeVoiceTimers.delete(guildId);
            }, timeoutMinutes * 60 * 1000);
            activeVoiceTimers.set(guildId, timer);
            console.log(`[VoiceTimeout] ⏱️ Timer set for guild ${guildId}: ${timeoutMinutes} minutes (${timeoutMinutes * 60 * 1000}ms)`);
            console.log(`[VoiceTimeout] Active timers count: ${activeVoiceTimers.size}`);
            console.log(`[VoiceTimeout] Timer will trigger at: ${new Date(Date.now() + (timeoutMinutes * 60 * 1000)).toISOString()}`);
            console.log(`[VoiceTimeout] Current time: ${new Date().toISOString()}`);
        } else {
            console.log(`Not starting timeout for guild ${guildId} as bot is not in a voice channel.`);
        }
    } else {
        console.log(`Voice timeout is disabled or not set for guild ${guildId}.`);
    }
}

export async function setGuildVoiceTimeout(guildId, minutes, djsClient) {
    if (isNaN(minutes) || minutes < 0) {
        return { success: false, message: "Invalid timeout value. Please enter a non-negative number." };
    }
    const parsedMinutes = parseInt(minutes);
    guildTimeouts.set(guildId, parsedMinutes);

    const currentSettings = await getGuildSettings(guildId);
    currentSettings.voice_timeout_minutes = parsedMinutes;
    await updateGuildSettings(guildId, currentSettings);

    await startOrResetVoiceTimeout(guildId, djsClient);
    return { success: true, message: parsedMinutes > 0 ? `Voice timeout set to ${parsedMinutes} minutes.` : "Voice timeout disabled." };
}

// Stub function for backward compatibility - voice checks are now event-driven
export function checkAllVoiceChannels() {
    console.log('[VoiceCheck] checkAllVoiceChannels called - voice checks are now event-driven, no action needed');
    return Promise.resolve();
}
