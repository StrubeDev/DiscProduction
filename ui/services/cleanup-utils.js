/**
 * Cleanup utility functions for guild data management
 */

// Import guildTimeouts from voice-timeout service
import { guildTimeouts } from './voice-timeout.js';

// Maps for tracking various guild data
export const configuredBotVoiceChannels = new Map(); // guildId -> voiceChannelId
export const guildErrorMessages = new Map(); // guildId -> { messageId, channelId, errorCount, lastError }

/**
 * Comprehensive cleanup for a specific guild - removes all data from Maps
 */
export function cleanupGuildMaps(guildId) {
    let cleanedCount = 0;
    
    // Clear voice timeouts
    if (guildTimeouts.has(guildId)) {
        guildTimeouts.delete(guildId);
        cleanedCount++;
    }
    
    // Clear configured voice channels
    if (configuredBotVoiceChannels.has(guildId)) {
        configuredBotVoiceChannels.delete(guildId);
        cleanedCount++;
    }
    
    // Clear error messages
    if (guildErrorMessages.has(guildId)) {
        guildErrorMessages.delete(guildId);
        cleanedCount++;
    }
    
    console.log(`[CleanupUtils] Cleaned up ${cleanedCount} entries for guild ${guildId}`);
}

/**
 * Clean up old data from Maps to prevent memory leaks
 */
export function cleanupOldMapData() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;
    
    // Clean up old error messages
    for (const [guildId, errorData] of guildErrorMessages.entries()) {
        if (now - errorData.lastError > maxAge) {
            guildErrorMessages.delete(guildId);
            cleanedCount++;
        }
    }
    
    console.log(`[CleanupUtils] Cleaned up ${cleanedCount} old entries from maps`);
}
