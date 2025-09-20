import { BaseState } from './base-state.js';

/**
 * Querying State
 * Music is being searched for
 */
export class QueryingState extends BaseState {
    constructor() {
        super('querying', {
            embedColor: 0x506098, // Blue
            statusIcon: '🔍', // Search icon
            loadingIndicator: '🔍 **Searching...**',
            buttonStates: {
                playPause: 'disabled',
                volume: 'disabled',
                skip: 'disabled',
                queue: 'disabled',
                addSong: 'disabled'
            },
            displayText: 'Searching for music'
        });
    }

    /**
     * Get the display text for querying state
     */
    getDisplayText(song, queueInfo) {
        if (song && song.query) {
            // Show the actual query being searched
            return `🔍 **Searching for:** \`${song.query}\`\n\nPlease wait while I find your song.`;
        }
        
        // Fallback to generic message
        return '🔍 **Searching for music...**\n\nPlease wait while I find your song.';
    }

    /**
     * Get loading GIF URL for querying state
     */
    async getLoadingGifUrl(guildId) {
        try {
            const { getRandomLoadingGif } = await import('../utils/constants/loading-gifs.js');
            return getRandomLoadingGif();
        } catch (error) {
            console.log(`[QueryingState] Error getting loading GIF for guild ${guildId}:`, error.message);
            return null;
        }
    }

    /**
     * Querying state is simple - no song data methods needed
     * Just shows generic searching message with GIF
     */
}
