// utils/helpers/session-helper.js
// Shared helper for creating voice connections and audio sessions

import { getOrCreateVoiceConnection, getOrUpdateSession } from '../../handlers/common/audio-session.js';

/**
 * Get or create voice connection and audio session for a guild
 * This is a shared function used by all track handlers
 * 
 * @param {Object} djsClient - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} member - Discord member
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>} - { connection, session, error }
 */
export async function getOrCreateSession(djsClient, guildId, member, channelId) {
    try {
        console.log(`[SessionHelper] Getting or creating session for guild ${guildId}`);
        
        // STEP 1: Get or create voice connection
        const connectionResult = await getOrCreateVoiceConnection(djsClient, guildId, member);
        if (connectionResult.error) {
            console.error(`[SessionHelper] Connection error for guild ${guildId}:`, connectionResult.error);
            
            // Import error messages for user-friendly error handling
            const { ErrorMessages } = await import('../../errors/error-messages.js');
            
            // Check if it's a specific error and use the centralized message
            let errorMessage = `Connection error: ${connectionResult.error}`;
            if (connectionResult.error.includes('User is not in a voice channel')) {
                errorMessage = ErrorMessages.SESSION_2011;
            }
            
            return { 
                connection: null, 
                session: null, 
                error: errorMessage 
            };
        }

        const { connection } = connectionResult;
        console.log(`[SessionHelper] ✅ Voice connection established for guild ${guildId}`);

        // STEP 2: Get or create audio session
        const session = await getOrUpdateSession(djsClient, guildId, connection, channelId, null);
        console.log(`[SessionHelper] ✅ Audio session ready for guild ${guildId}`);

        return {
            connection,
            session,
            error: null
        };

    } catch (error) {
        console.error(`[SessionHelper] Error creating session for guild ${guildId}:`, error.message);
        return {
            connection: null,
            session: null,
            error: error.message
        };
    }
}
