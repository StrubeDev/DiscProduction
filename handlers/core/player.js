// handlers/player.js
import { getExistingSession } from '../../utils/core/audio-state.js';
import { playerStateManager } from '../../utils/core/player-state-manager.js';
import { unifiedYtdlpService } from '../../utils/processors/unified-ytdlp-service.js';

/**
 * Centralized Player System
 * Handles all actual playback logic - no data collection, just playing
 */
class Player {
    constructor() {
        this.playingSongs = new Map(); // guildId -> song object
    }

    /**
     * Play a song from the queue
     * @param {string} guildId - Guild ID
     * @param {Object} song - Song object to play
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     * @param {Object} interactionDetails - Interaction details for user feedback
     * @param {string} displayPref - Display preference
     */
    async playSong(guildId, song, djsClient, session, interactionDetails = null, displayPref = null) {
        console.log(`[Player] 🎵 Starting playback for: "${song.title}" in guild ${guildId}`);
        
        // CLEANUP: Clean up the current song before starting a new one
        const currentSong = playerStateManager.getNowPlaying(guildId);
        console.log(`[Player] 🔍 DEBUG: Current song: "${currentSong?.title || 'none'}", New song: "${song.title}"`);
        console.log(`[Player] 🔍 DEBUG: Songs are different: ${currentSong !== song}`);
        
        if (currentSong && currentSong !== song) {
            console.log(`[Player] 🧹 CLEANING UP PREVIOUS SONG: "${currentSong.title}"`);
            try {
                const { cleanupService } = await import('../../utils/services/cleanup-service.js');
                await cleanupService.cleanupFinishedSong(guildId, currentSong, session);
                console.log(`[Player] ✅ Previous song cleanup completed`);
            } catch (cleanupError) {
                console.error(`[Player] ❌ Previous song cleanup failed:`, cleanupError.message);
            }
        } else if (currentSong) {
            console.log(`[Player] ⚠️ Same song detected, skipping cleanup: "${currentSong.title}"`);
        } else {
            console.log(`[Player] ℹ️ No current song to clean up`);
        }
        
        try {
            // Check if song is preloaded and ready for instant playback
            const { preloader } = await import('../../utils/services/preloader.js');
            console.log(`[Player] 🔍 DEBUG: Checking if song is ready - preloadCompleted: ${song.preloadCompleted}, processedAudioResource: ${!!song.processedAudioResource}, processedTempFile: ${!!song.processedTempFile}`);
            
            if (preloader.isSongReady(song)) {
                console.log(`[Player] ⚡ Using preloaded song for instant playback: "${song.title}"`);
                
                // Get preloaded data from separate storage (not from song object)
                const preloadedData = preloader.getPreloadedData(guildId, song.query);
                if (preloadedData) {
                    // Create stream details from preloaded data
                    song.streamDetails = {
                        audioResource: preloadedData.audioResource,
                        tempFile: preloadedData.tempFile,
                        metadata: preloadedData.metadata
                    };
                    
                    console.log(`[Player] ✅ Using preloaded audio resource for instant playback`);
                } else {
                    throw new Error('Preloaded data not available');
                }
                
                // For preloaded songs, still show loading sequence briefly for queue progression
                // This ensures users see the transition from previous song to next song
                try {
                    // Use StateCoordinator instead of UnifiedLoadingService
                    const { StateCoordinator } = await import('../../services/state-coordinator.js');
                    const hasActiveLoading = StateCoordinator.hasActiveLoading(guildId);
                    
                    if (hasActiveLoading) {
                        console.log(`[Player] ⚡ Loading sequence already active for queue progression, using preloaded song`);
                        // Add a small delay to ensure loading screen is visible
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (loadingError) {
                    console.log(`[Player] Loading sequence check error:`, loadingError.message);
                }
            } else {
                console.log(`[Player] 🔄 Song not preloaded, downloading now: "${song.title}"`);
                
                // Note: Loading sequence is handled by the unified media handler, not here
                
                // Get current volume from session
                const currentVolume = session?.volume || 100;
                
                // Get audio stream using unified service
                const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
                
                // Use the query directly - it should already be a YouTube URL from the unified media handler
                let audioQuery = song.query;
                
                // Only search for YouTube equivalent if we don't already have a YouTube URL
                if (song.spotifyData && (!song.query || (!song.query.includes('youtube.com') && !song.query.includes('youtu.be')))) {
                    console.log(`[Player] 🔍 Spotify track detected, searching for YouTube equivalent: "${song.title}"`);
                    try {
                        const { searchSongOnYouTube } = await import('../../utils/services/song-search-service.js');
                        const trackInfo = {
                            title: song.title,
                            artist: song.artist,
                            duration: song.duration,
                            thumbnailUrl: song.thumbnailUrl,
                            spotifyData: song.spotifyData
                        };
                        
                        const { youtubeUrl, searchQuery, error: searchError } = await searchSongOnYouTube(trackInfo, guildId);
                        
                        if (searchError || !youtubeUrl) {
                            throw new Error(`Failed to find YouTube equivalent: ${searchError || 'No YouTube URL found'}`);
                        }
                        
                        audioQuery = youtubeUrl;
                        console.log(`[Player] ✅ Found YouTube equivalent: ${youtubeUrl}`);
                    } catch (searchError) {
                        console.error(`[Player] ❌ Failed to search for YouTube equivalent:`, searchError.message);
                        throw new Error(`Failed to find YouTube equivalent for Spotify track: ${searchError.message}`);
                    }
                } else if (song.spotifyData) {
                    console.log(`[Player] ✅ Using pre-resolved YouTube URL for Spotify track: ${audioQuery}`);
                }
                
                try {
                    const streamData = await unifiedYtdlpService.getAudioStream(
                        audioQuery, 
                        guildId, 
                        currentVolume,
                        {
                            preloadedTempFile: song.preloadedTempFile,
                            preloadCompleted: song.preloadCompleted,
                            preloadedMetadata: song.preloadedMetadata
                        },
                        song // Pass the song object to preserve duration from Spotify API
                    );
                    
                    console.log(`[Player] ✅ Audio stream data received:`, {
                        hasAudioResource: !!streamData.audioResource,
                        hasTempFile: !!streamData.tempFile,
                        metadata: streamData.metadata?.title || 'Unknown'
                    });
                    
                    // Update song object with stream details
                    song.streamDetails = {
                        audioResource: streamData.audioResource,
                        tempFile: streamData.tempFile,
                        metadata: streamData.metadata
                    };
                } catch (streamError) {
                    console.error(`[Player] ❌ Failed to get audio stream for "${song.title}":`, streamError.message);
                    throw streamError;
                }
            }
            
            // Don't set loading to false here - let the loading sequence handle the state transitions
            
            // Play the audio resource - check both possible locations
            const audioResource = song.streamDetails?.audioResource || song.processedAudioResource;
            if (!audioResource) {
                console.error(`[Player] ❌ No audio resource available for playback. Stream details:`, song.streamDetails);
                throw new Error('No audio resource available for playback');
            }
            
            console.log(`[Player] 🔍 DEBUG: Player state before play: ${session.player.state.status}`);
            console.log(`[Player] 🔍 DEBUG: Audio resource type: ${audioResource.constructor.name}`);
            
            // Note: Loading sequence is now handled by the centralized loading sequence handler
            // This ensures consistent loading sequence across all song types
            
            session.player.play(audioResource);
            console.log(`[Player] 🔍 DEBUG: Player state after play: ${session.player.state.status}`);
            
            // Track playing song
            this.playingSongs.set(guildId, song);
            
            // Set as now playing in state manager
            playerStateManager.setNowPlaying(guildId, song);
            
            // Complete the loading sequence to transition to green playing state
            try {
                const { loadingSequenceHandler } = await import('../../utils/services/loading-sequence-handler.js');
                await loadingSequenceHandler.completeLoadingSequence(guildId, song);
                console.log(`[Player] ✅ Loading sequence completed for: "${song.title}"`);
            } catch (loadingCompleteError) {
                console.log(`[Player] Loading sequence completion error:`, loadingCompleteError.message);
            }
            
            console.log(`[Player] ✅ Successfully started playing: "${song.title}"`);
            
            // Emit events for UI updates
            djsClient.emit('audioPlayerStart', guildId, session);
            // Don't emit queueChanged here - this is just playback starting, not a queue change
            
        } catch (error) {
            console.error(`[Player] ❌ Failed to play "${song.title}":`, error.message);
            
            // Clean up the failed song
            try {
                const { cleanupService } = await import('../../utils/services/cleanup-service.js');
                await cleanupService.cleanupQueuedSong(song);
            } catch (cleanupError) {
                console.error(`[Player] Error cleaning up failed song:`, cleanupError.message);
            }
            
            playerStateManager.clearNowPlaying(guildId);
            playerStateManager.setLoading(guildId, false);
            throw error;
        }
    }

    /**
     * Stop current song
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    stopSong(guildId, session) {
        console.log(`[Player] ⏹️ Stopping playback for guild ${guildId}`);
        
        if (session.player) {
            session.player.stop();
        }
        
        playerStateManager.clearNowPlaying(guildId);
        this.playingSongs.delete(guildId);
        
        console.log(`[Player] ✅ Stopped playback for guild ${guildId}`);
    }

    /**
     * Pause current song
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    pauseSong(guildId, session) {
        console.log(`[Player] ⏸️ Pausing playback for guild ${guildId}`);
        
        if (session.player && playerStateManager.isPlaying(guildId)) {
            session.player.pause();
            console.log(`[Player] ✅ Paused playback for guild ${guildId}`);
        }
    }

    /**
     * Resume current song
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    resumeSong(guildId, session) {
        console.log(`[Player] ▶️ Resuming playback for guild ${guildId}`);
        
        if (session.player && playerStateManager.isPaused(guildId)) {
            session.player.unpause();
            console.log(`[Player] ✅ Resumed playback for guild ${guildId}`);
        }
    }

    /**
     * Get currently playing song
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Currently playing song or null
     */
    getCurrentSong(guildId) {
        return this.playingSongs.get(guildId) || null;
    }

    /**
     * Check if a song is currently playing
     * @param {string} guildId - Guild ID
     * @returns {boolean} True if playing
     */
    isPlaying(guildId) {
        return playerStateManager.isPlaying(guildId);
    }

    /**
     * Play a song directly without going through unified media handler
     * Used for auto-advance when song is already processed
     * @param {string} guildId - Guild ID
     * @param {Object} song - Song object to play
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     * @param {Object} interactionDetails - Interaction details for user feedback
     * @param {string} displayPref - Display preference
     */
    async playSongDirectly(guildId, song, djsClient, session, interactionDetails = null, displayPref = null) {
        console.log(`[Player] 🎵 DIRECT PLAYBACK: Starting direct playback for: "${song.title}" in guild ${guildId}`);
        console.log(`[Player] 🔍 DEBUG: Song object properties:`, Object.keys(song));
        console.log(`[Player] 🔍 DEBUG: Song query:`, song.query);
        console.log(`[Player] 🔍 DEBUG: Song originalQuery:`, song.originalQuery);
        console.log(`[Player] 🔍 DEBUG: Song searchQuery:`, song.searchQuery);
        
        try {
            // Set now playing state
            playerStateManager.setNowPlaying(guildId, song);
            playerStateManager.setLoading(guildId, true);
            
            // Get current volume from session
            const currentVolume = session?.volume || 100;
            
            // Use query, originalQuery, or searchQuery as fallback
            const audioQuery = song.query || song.originalQuery || song.searchQuery;
            if (!audioQuery) {
                throw new Error('No valid query found in song object for audio processing');
            }
            
            console.log(`[Player] 🔍 DEBUG: Using audio query:`, audioQuery);
            
            // Get audio stream using unified service
            const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
            const streamData = await unifiedYtdlpService.getAudioStream(audioQuery, guildId, currentVolume);
            
            if (!streamData || !streamData.audioResource) {
                throw new Error('Failed to get audio stream for direct playback');
            }
            
            // Update song with stream details
            song.streamDetails = streamData;
            
            // Play the audio
            session.player.play(streamData.audioResource);
            session.audioResource = streamData.audioResource;
            session.startTime = Date.now();
            
            // Update state
            playerStateManager.setLoading(guildId, false);
            
            console.log(`[Player] ✅ DIRECT PLAYBACK: Successfully started playing "${song.title}"`);
            
        } catch (error) {
            console.error(`[Player] ❌ DIRECT PLAYBACK ERROR:`, error.message);
            playerStateManager.setLoading(guildId, false);
            throw error;
        }
    }

    /**
     * Handle when a song finishes playing
     * This should be called by the audio session's idle event
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    async handleSongFinish(guildId, session) {
        console.log(`[Player] 🎵 HANDLING SONG FINISH for guild ${guildId}`);
        
        try {
            // Get the current song before resetting state
            const currentSong = playerStateManager.getNowPlaying(guildId);
            
            // Reset player state
            playerStateManager.setLoading(guildId, false);
            playerStateManager.setNowPlaying(guildId, null);
            
            // CRITICAL: Manually set Discord status to idle since the player might not fire the event
            const state = playerStateManager.getState(guildId);
            if (state) {
                state.discordStatus = 'idle';
                state.isPlaying = false;
                state.isPaused = false;
                state.isStarting = false;
                state.isBuffering = false;
                console.log(`[Player] ✅ Manually set Discord status to idle for guild ${guildId}`);
            }
            
            // REMOVE FINISHED SONG: Remove the finished song from queue (keep remaining songs)
            if (session && session.queue && session.queue.length > 0) {
                const finishedSong = session.queue.shift(); // Remove first song (the one that finished)
                console.log(`[Player] ✅ Removed finished song from queue: "${finishedSong?.title || 'Unknown'}"`);
                console.log(`[Player] 📋 Queue now has ${session.queue.length} song(s) remaining`);
            }
            
            // TRIGGER IDLE STATE: Set idle state when song finishes
            try {
                const { StateCoordinator } = await import('../../services/state-coordinator.js');
                await StateCoordinator.setIdleState(guildId);
                console.log(`[Player] ✅ Idle state triggered for guild ${guildId}`);
            } catch (stateError) {
                console.error(`[Player] ❌ Failed to trigger idle state:`, stateError.message);
            }
            
            // Note: isStarting is a getter property, so we use playerStateManager.setLoading(false) above
            
            console.log(`[Player] ✅ Player state reset completed for guild ${guildId}`);
            
            // Clean up the finished song using the cleanup service
            if (currentSong) {
                const { cleanupService } = await import('../../utils/services/cleanup-service.js');
                await cleanupService.cleanupFinishedSong(guildId, currentSong, session);
                console.log(`[Player] ✅ Song cleanup completed for: "${currentSong.title}"`);
            }
            
            // No need for aggressive queue cleanup - songs are now lightweight
            
            // IMMEDIATE TEMP FILE CLEANUP: Force cleanup of all temp files right after song finishes
            // This ensures files are deleted immediately, not waiting for the timer
            try {
                const { cleanupService } = await import('../../utils/services/cleanup-service.js');
                await cleanupService.forceCleanupAllTempFiles();
                console.log(`[Player] ✅ Immediate temp file cleanup completed for guild ${guildId}`);
            } catch (forceCleanupError) {
                console.error(`[Player] ❌ Immediate temp file cleanup failed:`, forceCleanupError.message);
            }
            
            // Check memory usage after song finish (event-driven)
            const { checkMemoryUsage } = await import('../common/audio-session.js');
            checkMemoryUsage();
            
        } catch (error) {
            console.error(`[Player] ❌ Error handling song finish:`, error.message);
        }
    }
}

// Export singleton instance
export const player = new Player();
