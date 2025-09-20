/**
 * Message Content Generators
 * Centralized content generation for different message types
 */

import { playbackcontrols } from '../../ui/playback-controls.js';
import { formatQueueMessagePayload } from '../../utils/helpers/message-helpers.js';
import { guildAudioSessions } from '../../utils/core/audio-state.js';

/**
 * Generate playback controls content
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Object} Discord message data
 */
export async function generatePlaybackControlsContent(guildId, djsClient) {
    return await playbackcontrols(guildId, djsClient);
}

/**
 * Generate queue message content
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} session - Audio session
 * @param {boolean} isStopped - Whether playback is stopped
 * @returns {Object} Discord message data
 */
export async function generateQueueMessageContent(guildId, djsClient, session, isStopped = false) {
    if (!session) {
        session = guildAudioSessions.get(guildId);
    }
    
    if (!session) {
        return {
            content: "No active session found.",
            embeds: []
        };
    }
    
    return await formatQueueMessagePayload(session, isStopped, guildId);
}

/**
 * Generate error embed content
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 * @param {string} timestamp - Error timestamp
 * @returns {Object} Discord embed data
 */
export function generateErrorEmbedContent(errorType, errorMessage, timestamp) {
    return {
        color: 0xFF0000, // Red color for errors
        title: '❌ Music Bot Error',
        description: `**${errorType}** - ${new Date(timestamp).toLocaleString()}`,
        fields: [
            {
                name: 'Error Details',
                value: errorMessage.length > 1024 ? errorMessage.substring(0, 1021) + '...' : errorMessage,
                inline: false
            }
        ],
        timestamp: timestamp,
        footer: {
            text: 'This error will be automatically cleared when music resumes'
        }
    };
}

/**
 * Generate loading message content
 * @param {string} songTitle - Title of the song being loaded
 * @param {string} loadingGif - Loading GIF URL
 * @returns {Object} Discord embed data
 */
export function generateLoadingMessageContent(songTitle, loadingGif) {
    return {
        color: 0xFFA500, // Orange color for loading
        title: '⏳ Loading Music...',
        description: `**${songTitle}**`,
        image: {
            url: loadingGif
        },
        footer: {
            text: 'Please wait while the music loads...'
        }
    };
}
