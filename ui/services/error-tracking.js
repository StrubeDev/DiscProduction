/**
 * Error tracking service for music bot errors
 */

// Map to track error messages per guild
const guildErrorMessages = new Map();

export async function trackError(guildId, errorType, errorMessage, djsClient) {
    try {
        console.log(`[ErrorTracker] Tracking error for guild ${guildId}: ${errorType} - ${errorMessage}`);
        
        const existingError = guildErrorMessages.get(guildId);
        const currentTime = new Date().toISOString();
        
        if (existingError && existingError.messageId) {
            // Update existing error message
            await updateErrorEmbed(guildId, errorType, errorMessage, currentTime, djsClient);
        } else {
            // Create new error message
            await createErrorEmbed(guildId, errorType, errorMessage, currentTime, djsClient);
        }
    } catch (error) {
        console.error(`[ErrorTracker] Failed to track error for guild ${guildId}:`, error.message);
    }
}

async function createErrorEmbed(guildId, errorType, errorMessage, timestamp, djsClient) {
    try {
        // Import here to avoid circular dependencies
        const { guildAudioSessions } = await import('../../../handlers/common/audio-session.js');
        
        const session = guildAudioSessions.get(guildId);
        if (!session || !session.textChannelId) {
            console.log(`[ErrorTracker] No text channel found for guild ${guildId}, cannot create error embed`);
            return;
        }

        const channel = await djsClient.channels.fetch(session.textChannelId);
        if (!channel || !channel.isTextBased()) {
            console.log(`[ErrorTracker] Invalid channel for guild ${guildId}`);
            return;
        }

        const embed = {
            title: '⚠️ Music Bot Errors',
            description: 'Recent errors encountered while playing music:',
            color: 0xFF6B6B,
            fields: [
                {
                    name: `${errorType} - ${new Date(timestamp).toLocaleTimeString()}`,
                    value: errorMessage.length > 1024 ? errorMessage.substring(0, 1021) + '...' : errorMessage,
                    inline: false
                }
            ],
            footer: {
                text: 'Errors are automatically cleared when music resumes successfully'
            },
            timestamp: timestamp
        };

        const message = await channel.send({ embeds: [embed] });
        
        guildErrorMessages.set(guildId, {
            messageId: message.id,
            channelId: channel.id,
            errorCount: 1,
            lastError: { type: errorType, message: errorMessage, timestamp }
        });

        console.log(`[ErrorTracker] Created error embed for guild ${guildId}: ${message.id}`);
    } catch (error) {
        console.error(`[ErrorTracker] Failed to create error embed for guild ${guildId}:`, error.message);
    }
}

async function updateErrorEmbed(guildId, errorType, errorMessage, timestamp, djsClient) {
    try {
        const existingError = guildErrorMessages.get(guildId);
        const channel = await djsClient.channels.fetch(existingError.channelId);
        
        if (!channel || !channel.isTextBased()) {
            console.log(`[ErrorTracker] Invalid channel for guild ${guildId}, recreating error embed`);
            guildErrorMessages.delete(guildId);
            await createErrorEmbed(guildId, errorType, errorMessage, timestamp, djsClient);
            return;
        }

        // Get existing message
        const message = await channel.messages.fetch(existingError.messageId);
        if (!message) {
            console.log(`[ErrorTracker] Error message not found for guild ${guildId}, recreating`);
            guildErrorMessages.delete(guildId);
            await createErrorEmbed(guildId, errorType, errorMessage, timestamp, djsClient);
            return;
        }

        // Update embed with new error
        const embed = message.embeds[0];
        const newField = {
            name: `${errorType} - ${new Date(timestamp).toLocaleTimeString()}`,
            value: errorMessage.length > 1024 ? errorMessage.substring(0, 1021) + '...' : errorMessage,
            inline: false
        };

        // Keep only last 5 errors to prevent embed from getting too long
        const fields = [newField, ...embed.fields.slice(0, 4)];
        
        const updatedEmbed = {
            ...embed,
            fields: fields,
            timestamp: timestamp
        };

        await message.edit({ embeds: [updatedEmbed] });

        // Update tracking data
        existingError.errorCount++;
        existingError.lastError = { type: errorType, message: errorMessage, timestamp };
        guildErrorMessages.set(guildId, existingError);

        console.log(`[ErrorTracker] Updated error embed for guild ${guildId}: ${existingError.errorCount} total errors`);
    } catch (error) {
        console.error(`[ErrorTracker] Failed to update error embed for guild ${guildId}:`, error.message);
    }
}

export async function clearErrorEmbed(guildId, djsClient) {
    try {
        const existingError = guildErrorMessages.get(guildId);
        if (!existingError || !existingError.messageId) return;

        const channel = await djsClient.channels.fetch(existingError.channelId);
        if (channel && channel.isTextBased()) {
            try {
                await channel.messages.delete(existingError.messageId);
                console.log(`[ErrorTracker] Deleted error embed for guild ${guildId}`);
            } catch (deleteError) {
                console.log(`[ErrorTracker] Could not delete error embed for guild ${guildId}:`, deleteError.message);
            }
        }

        guildErrorMessages.delete(guildId);
    } catch (error) {
        console.error(`[ErrorTracker] Failed to clear error embed for guild ${guildId}:`, error.message);
    }
}

// Export the error tracking map for debugging
export function getErrorTrackingStats() {
    return {
        totalGuilds: guildErrorMessages.size,
        guilds: Array.from(guildErrorMessages.entries()).map(([guildId, data]) => ({
            guildId,
            errorCount: data.errorCount,
            lastError: data.lastError
        }))
    };
}

