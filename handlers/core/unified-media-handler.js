// handlers/core/unified-media-handler.js
// Unified Media Handler - Single entry point for all media types

// Removed canPlayImmediately: single-path enqueue via queue manager
import { createError, throwError, ErrorCodes, errorHandler } from '../../errors/index.js';
import { MessageFormatters } from '../../errors/error-utils.js';

/**
 * Unified Media Handler
 * 
 * Single entry point for all media types (Spotify, YouTube, search)
 * Handles loading, delegation, and user feedback consistently
 */
export class UnifiedMediaHandler {
    constructor() {
        this.mediaProcessors = new Map();
        this.loadingService = null;
    }

    /**
     * Initialize the handler with media processors
     */
    async initialize() {
        if (this.loadingService) {
            return; // Already initialized
        }
        
        // Lazy load services
        this.loadingService = await import('../../utils/services/unified-loading-service.js');
        
        // Register media processors
        this.mediaProcessors.set('spotify-track', await import('../media/spotify-tracks.js'));
        this.mediaProcessors.set('youtube-track', await import('../../utils/processors/unified-ytdlp-service.js'));
        this.mediaProcessors.set('search', await import('../../utils/processors/unified-ytdlp-service.js'));
    }

    /**
     * Handle any media type with unified loading and delegation
     * @param {string} mediaType - Type of media (spotify-track, youtube-track, search)
     * @param {Object} params - Parameters for the specific media type
     * @param {Object} context - Common context (djsClient, guildId, member, etc.)
     */
    async handleMedia(mediaType, params, context) {
        const { djsClient, guildId, member, channelId, interactionDetails, displayPref } = context;
        const { query, searchQuery } = params;

        console.log(`[UnifiedMediaHandler] 🎵 Handling ${mediaType}: "${query || searchQuery}"`);

        try {
            // STEP 1: Blue loading state is already handled by the modal submission
            // No need to start unified loading here as it conflicts with StateCoordinator

            // STEP 2: Process media based on type (fetch metadata/stream)
            const songObject = await this.processMedia(mediaType, params, context);
            
            if (!songObject) {
                throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_PROCESS, { mediaType });
            }

            console.log(`[UnifiedMediaHandler] ✅ Processed media: "${songObject.title}"`);

            // STEP 3: Check for active processes BEFORE setting any state
            try {
                const { StateCoordinator } = await import('../../services/state-coordinator.js');
                const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
                const isQuerying = trackedState?.currentState === 'querying';
                const isLoading = trackedState?.currentState === 'loading';
                const isPlaying = trackedState?.currentState === 'playing';
                
                console.log(`[UnifiedMediaHandler] 🔍 Pre-loading state check:`, {
                    currentState: trackedState?.currentState,
                    isQuerying,
                    isLoading,
                    isPlaying,
                    songTitle: songObject.title
                });
                
            // Don't clear querying state - let it transition to loading when playback starts
            console.log(`[UnifiedMediaHandler] ✅ Song processed, delegating to queue manager for: "${songObject.title}"`);
            } catch (e) {
                console.log('[UnifiedMediaHandler] Unable to check/set loading state:', e.message);
            }

            // STEP 4: Clear querying and set loading true while enqueue/prepare (only if no active process)
            try {
                const { StateCoordinator } = await import('../../services/state-coordinator.js');
                const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
                const isQuerying = trackedState?.currentState === 'querying';
                const isLoading = trackedState?.currentState === 'loading';
                const isPlaying = trackedState?.currentState === 'playing';
                const hasActiveProcess = isQuerying || isLoading || isPlaying;
                
                if (!hasActiveProcess) {
                    const { playerStateManager } = await import('../../utils/core/player-state-manager.js');
                    playerStateManager.updateState(guildId, { isQuerying: false, isStarting: true });
                    console.log(`[UnifiedMediaHandler] ✅ Player state updated for: "${songObject.title}"`);
                } else {
                    console.log(`[UnifiedMediaHandler] 🚫 Skipping player state update for: "${songObject.title}" (active process detected)`);
                }
            } catch (e) {
                console.log('[UnifiedMediaHandler] Unable to set loading state:', e.message);
            }

            // STEP 4: Get or create session
            const { getOrCreateSession } = await import('../../utils/helpers/session-helper.js');
            const { connection, session, error } = await getOrCreateSession(djsClient, guildId, member, channelId);
            
            if (error) {
                throwError.session(ErrorCodes.SESSION.SESSION_CREATION_FAILED, { error });
            }

            // STEP 5: Always delegate through the queue manager (single-source-of-truth)
            await this.handleQueueAddition(songObject, session, context);

            // STEP 4: Loading will be completed by the player when audio actually starts
            // (Removed duplicate completeLoading call to prevent premature loading state clearing)

            console.log(`[UnifiedMediaHandler] ✅ Successfully handled ${mediaType}: "${songObject.title}"`);

        } catch (error) {
            errorHandler.handleError(error, { guildId, mediaType });
            await this.handleError(guildId, error.message, interactionDetails);
            throw error;
        }
    }

    /**
     * Process different media types
     */
    async processMedia(mediaType, params, context) {
        const { query, searchQuery } = params;

        switch (mediaType) {
            case 'spotify-track':
                return await this.processSpotifyTrack(query, context);
            
            case 'youtube-track':
                return await this.processYouTubeTrack(query, context);
            
            case 'search':
                return await this.processSearchQuery(searchQuery, context);
            
            default:
                throwError.validation(ErrorCodes.VALIDATION.INVALID_QUERY, { mediaType });
        }
    }

    /**
     * Process Spotify track
     */
    async processSpotifyTrack(spotifyUrl, context) {
        const { interactionDetails } = context;
        
        // Extract track ID and fetch details
        const trackId = this.extractSpotifyTrackId(spotifyUrl);
        if (!trackId) {
            throwError.validation(ErrorCodes.VALIDATION.INVALID_SPOTIFY_URL, { spotifyUrl });
        }

        const { getTrackDetails } = await import('../media/spotify-tracks.js');
        const trackDetails = await getTrackDetails(trackId);
        
        if (!trackDetails) {
            throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_GET_VIDEO_INFO, { trackId });
        }

        // Search for YouTube equivalent
        const { searchSongOnYouTube, createSongObject } = await import('../../utils/services/song-search-service.js');
        
        const trackInfo = {
            title: trackDetails.title,
            artist: trackDetails.artist,
            duration: trackDetails.duration,
            imageUrl: trackDetails.albumArtUrl || trackDetails.artistImageUrl,
            spotifyData: trackDetails
        };

        const { youtubeUrl, searchQuery, error: searchError } = await searchSongOnYouTube(trackInfo, context.guildId);
        
        if (searchError) {
            throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_PROCESS, { searchError, trackTitle: trackDetails.title });
        }

        return createSongObject(trackInfo, youtubeUrl, searchQuery, interactionDetails, spotifyUrl);
    }

    /**
     * Process YouTube track
     */
    async processYouTubeTrack(youtubeUrl, context) {
        const { interactionDetails } = context;
        
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        const streamData = await unifiedYtdlpService.getAudioStream(youtubeUrl, context.guildId, 100);
        
        return {
            title: streamData.metadata.title,
            artist: streamData.metadata.artist || 'Unknown Artist',
            duration: streamData.metadata.duration || 'Unknown Duration',
            query: youtubeUrl,
            addedBy: interactionDetails?.user?.username || 'Unknown User',
            addedById: interactionDetails?.user?.id || 'unknown',
            addedByAvatar: interactionDetails?.user?.avatar || null,
            imageUrl: streamData.metadata.thumbnailUrl,
            youtubeUrl: youtubeUrl,
            streamDetails: {
                audioResource: streamData.audioResource,
                tempFile: streamData.tempFile,
                metadata: streamData.metadata
            }
        };
    }

    /**
     * Process search query
     */
    async processSearchQuery(searchQuery, context) {
        const { interactionDetails } = context;
        
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        const youtubeUrl = await unifiedYtdlpService.searchSong(searchQuery);
        
        // Process as YouTube track
        return await this.processYouTubeTrack(youtubeUrl, context);
    }

    // Removed handleImmediatePlayback: single-path enqueue

    /**
     * Handle queue addition
     */
    async handleQueueAddition(songObject, session, context) {
        const { djsClient, guildId, interactionDetails, displayPref } = context;
        
        console.log(`[UnifiedMediaHandler] 📋 Enqueuing via queue manager (single-path)`);
        
        // Let QueueManager handle the playback decision - don't make it here
        console.log(`[UnifiedMediaHandler] 🔍 Delegating playback decision to QueueManager`);
        
        const { queueManager } = await import('../../utils/services/queue-manager.js');
        await queueManager.addSongsToQueue(
            guildId, 
            [songObject], 
            djsClient, 
            session, 
            {
                shouldPreload: true,
                preloadOnlyNext: true,
                emitQueueChanged: true,
                startPlayback: true, // Let QueueManager decide based on state
                interactionDetails: interactionDetails,
                displayPref: displayPref
            }
        );
        
        // Send success message
        await this.sendSuccessMessage(interactionDetails, `📋 Added to queue: **${songObject.title}**`);
    }

    /**
     * Complete unified loading - REMOVED
     * Loading is now completed by the player when audio actually starts playing
     * This prevents premature clearing of the loading state
     */

    /**
     * Handle errors
     */
    async handleError(guildId, errorMessage, interactionDetails) {
        try {
            await this.loadingService.handleUnifiedLoadingError(guildId, errorMessage);
        } catch (error) {
            console.error(`[UnifiedMediaHandler] Error handling loading error:`, error.message);
        }
    }

    /**
     * Send success message
     */
    async sendSuccessMessage(interactionDetails, message) {
        if (!interactionDetails) return;
        
        try {
            // Now playing message is handled by the state system (PlayingState)
            console.log(`[UnifiedMediaHandler] Now playing: ${message} (handled by state system)`);
        } catch (messageError) {
            console.log(`[UnifiedMediaHandler] Error sending message:`, messageError.message);
        }
    }

    /**
     * Extract Spotify track ID from URL
     */
    extractSpotifyTrackId(spotifyUrl) {
        if (spotifyUrl.startsWith('spotify:track:')) {
            return spotifyUrl.replace('spotify:track:', '');
        }
        
        if (spotifyUrl.includes('open.spotify.com/track/')) {
            const match = spotifyUrl.match(/\/track\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }
        
        return null;
    }
}

// Export singleton instance
export const unifiedMediaHandler = new UnifiedMediaHandler();

// Convenience functions for backward compatibility
export async function handleSpotifyTrack(djsClient, guildId, member, channelId, spotifyUrl, interactionDetails, displayPref) {
    try {
        await unifiedMediaHandler.initialize();
        return await unifiedMediaHandler.handleMedia('spotify-track', { query: spotifyUrl }, {
            djsClient, guildId, member, channelId, interactionDetails, displayPref
        });
    } catch (error) {
        console.error('[UnifiedMediaHandler] Error in handleSpotifyTrack:', error);
        throw error;
    }
}

export async function handleYouTubeTrack(djsClient, guildId, member, channelId, query, interactionDetails, displayPref) {
    try {
        await unifiedMediaHandler.initialize();
        return await unifiedMediaHandler.handleMedia('youtube-track', { query }, {
            djsClient, guildId, member, channelId, interactionDetails, displayPref
        });
    } catch (error) {
        console.error('[UnifiedMediaHandler] Error in handleYouTubeTrack:', error);
        throw error;
    }
}

export async function handleSearchQuery(djsClient, guildId, member, channelId, searchQuery, interactionDetails, displayPref) {
    try {
        await unifiedMediaHandler.initialize();
        return await unifiedMediaHandler.handleMedia('search', { searchQuery }, {
            djsClient, guildId, member, channelId, interactionDetails, displayPref
        });
    } catch (error) {
        console.error('[UnifiedMediaHandler] Error in handleSearchQuery:', error);
        throw error;
    }
}
