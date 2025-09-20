/**
 * Message Content Generators
 * Centralized content generation for different message types
 */

import { formatQueueMessagePayload } from '../utils/helpers/message-helpers.js';
import { guildAudioSessions } from '../utils/core/audio-state.js';

/**
 * Generate playback controls content
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {string} stateType - The state type to generate content for
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function generatePlaybackControlsContent(guildId, djsClient, stateType, trackedState) {
    // Get embed content from the appropriate page
    let pageData;
    if (stateType === 'loading') {
        const { handleLoadingPage } = await import('./loading-page.js');
        pageData = await handleLoadingPage(guildId, djsClient, trackedState);
    } else if (stateType === 'playing') {
        const { handlePlayingPage } = await import('./playing-page.js');
        pageData = await handlePlayingPage(guildId, djsClient, trackedState);
    } else if (stateType === 'querying') {
        const { handleQueryingPage } = await import('./querying-page.js');
        pageData = await handleQueryingPage(guildId, djsClient, trackedState);
    } else if (stateType === 'paused') {
        // Use playing page for paused state (same content, different color)
        const { handlePlayingPage } = await import('./playing-page.js');
        pageData = await handlePlayingPage(guildId, djsClient, trackedState);
    } else {
        // Check if bot is connected to voice channel
        const { getVoiceConnection, VoiceConnectionStatus } = await import('@discordjs/voice');
        const connection = getVoiceConnection(guildId);
        const isConnected = connection && connection.state.status !== VoiceConnectionStatus.Destroyed;
        
        if (isConnected) {
            const { handleIdlePage } = await import('./idle-page.js');
            pageData = await handleIdlePage(guildId, djsClient, trackedState);
        } else {
            const { handleDefaultPage } = await import('./default-page.js');
            pageData = await handleDefaultPage(guildId, djsClient, trackedState);
        }
    }
    
    // Get button components from playback controls component
    const { getPlaybackControlButtons } = await import('../ui/components/playback-controls.js');
    const buttonComponents = await getPlaybackControlButtons(guildId, djsClient, stateType);
    
    // Combine page embed with button components
    return {
        embeds: pageData.embeds,
        components: buttonComponents
    };
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
