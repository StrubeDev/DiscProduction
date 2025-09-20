// utils/services/loading-sequence-handler.js
// Centralized loading sequence handler for all song playback

/**
 * Unified Loading Sequence Handler
 * Handles the complete loading sequence (initial → yellow → green) for all song types
 */
class LoadingSequenceHandler {
    constructor() {
        this.loadingService = null;
    }

    async initialize() {
        if (this.loadingService) {
            return; // Already initialized
        }
        
        const { unifiedLoadingService } = await import('./unified-loading-service.js');
        this.loadingService = unifiedLoadingService;
    }

    /**
     * Start the complete loading sequence for a song
     * @param {string} guildId - Guild ID
     * @param {Object} songObject - Song object with metadata
     * @param {Object} interactionDetails - Interaction details (can be minimal for queue progression)
     * @param {string} query - Original query string
     */
    async startLoadingSequence(guildId, songObject, interactionDetails, query) {
        console.log(`[LoadingSequence] 🎵 Starting loading sequence for: "${songObject.title}"`);
        
        // Use StateCoordinator instead of UnifiedLoadingService
        try {
            const { StateCoordinator } = await import('../../services/state-coordinator.js');
            
            // Show orange loading state with metadata
            const songMetadata = {
                title: songObject.title,
                artist: songObject.artist || 'Unknown Artist',
                duration: songObject.duration || 'Unknown Duration',
                thumbnail: songObject.imageUrl,
                addedBy: songObject.addedBy || 'Unknown User',
                // Add source information for loading page logic
                source: songObject.spotifyData ? 'spotify' : 'youtube',
                isSpotify: !!songObject.spotifyData
            };
            
            await StateCoordinator.setLoadingState(guildId, true, songMetadata);
            console.log(`[LoadingSequence] ✅ Orange loading state shown for: "${songObject.title}"`);
        } catch (error) {
            console.log(`[LoadingSequence] Error showing loading state:`, error.message);
        }
    }

    /**
     * Complete the loading sequence when audio starts playing
     * @param {string} guildId - Guild ID
     * @param {Object} songObject - Song object with metadata
     */
    async completeLoadingSequence(guildId, songObject) {
        console.log(`[LoadingSequence] 🎵 Completing loading sequence for: "${songObject.title}"`);
        
        // Use StateCoordinator instead of UnifiedLoadingService
        try {
            const { StateCoordinator } = await import('../../services/state-coordinator.js');
            
            const songData = {
                title: songObject.title,
                artist: songObject.artist || 'Unknown Artist',
                duration: songObject.duration || 'Unknown Duration',
                thumbnail: songObject.imageUrl,
                // Add source information for playing page logic
                source: songObject.spotifyData ? 'spotify' : 'youtube',
                isSpotify: !!songObject.spotifyData
            };
            
            await StateCoordinator.setPlayingState(guildId, true, songData);
            console.log(`[LoadingSequence] ✅ Playing state set for: "${songObject.title}"`);
        } catch (error) {
            console.log(`[LoadingSequence] Error setting playing state:`, error.message);
        }
    }

    /**
     * Create minimal interaction details for queue progression
     * @param {Object} songObject - Song object with user info
     * @returns {Object} Minimal interaction details
     */
    createQueueInteractionDetails(songObject) {
        return {
            user: { 
                username: songObject.addedBy || 'Unknown User',
                id: songObject.addedById || 'unknown',
                avatar: songObject.addedByAvatar || null
            },
            applicationId: 'queue-progression',
            interactionToken: 'queue-progression'
        };
    }
}

// Export singleton instance
export const loadingSequenceHandler = new LoadingSequenceHandler();
