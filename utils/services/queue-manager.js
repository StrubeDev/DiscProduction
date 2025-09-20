// utils/queue-manager.js
import { getExistingSession } from '../core/audio-state.js';
import { preloader } from './preloader.js';

/**
 * Centralized Queue Manager
 * Handles all queue operations consistently across all handlers
 */
class QueueManager {
    constructor() {
        this.preloadInProgress = new Map(); // guildId -> Set of song titles being preloaded
    }

    /**
     * Add songs to queue with proper preload management
     * @param {string} guildId - Guild ID
     * @param {Array} songs - Array of song objects to add
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     * @param {Object} options - Options for queue management
     */
    async addSongsToQueue(guildId, songs, djsClient, session, options = {}) {
        const {
            shouldPreload = true,
            preloadOnlyNext = true,
            emitQueueChanged = true,
            startPlayback = true
        } = options;

        console.log(`[QueueManager] Adding ${songs.length} songs to queue for guild ${guildId}`);
        
        // Check if we should start playback (no song currently playing)
        const isDiscordIdle = session?.player?.state?.status === 'idle';
        const isPlayerPlaying = session?.player?.state?.status === 'playing';
        const isPlayerPaused = session?.player?.state?.status === 'paused';
        
        // CRITICAL: Check StateCoordinator for querying/loading states
        const { StateCoordinator } = await import('../../services/state-coordinator.js');
        const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
        const isQuerying = trackedState?.currentState === 'querying';
        const isLoading = trackedState?.currentState === 'loading';
        
        console.log(`[QueueManager] Player state: ${session?.player?.state?.status}, nowPlaying: ${!!session.nowPlaying}, isPlaying: ${session.isPlaying}`);
        console.log(`[QueueManager] StateCoordinator state: ${trackedState?.currentState}, isQuerying: ${isQuerying}, isLoading: ${isLoading}`);
        
        // Check if Discord player is actually playing
        const isDiscordPlaying = session.player.state.status === 'playing';
        
        // FIXED LOGIC: Only start immediate playback if:
        // 1. Discord player is idle (not playing anything)
        // 2. No song is currently playing (nowPlaying is null)
        // 3. No queue exists (if there's a queue, add to queue instead)
        // 4. Not currently querying or loading another song
        const hasNowPlaying = !!session.nowPlaying;
        const hasQueue = session.queue && session.queue.length > 0;
        const isFirstSong = !hasNowPlaying && !hasQueue && !isDiscordPlaying;
        const shouldStartPlayback = startPlayback && isDiscordIdle && !hasNowPlaying && !hasQueue && !isQuerying && !isLoading;
        
        console.log(`[QueueManager] shouldStartPlayback: ${shouldStartPlayback} (idle: ${isDiscordIdle}, hasNowPlaying: ${hasNowPlaying}, hasQueue: ${hasQueue}, noQuerying: ${!isQuerying}, noLoading: ${!isLoading})`);
        
        // DON'T clear the queue when player is idle - the queue should persist
        // The queue should remain so that when a song finishes, the next song can be played
        
        // Add songs to session queue
        session.queue.push(...songs);
        
        // Update lazy load info if provided
        if (options.lazyLoadInfo) {
            session.lazyLoadInfo = options.lazyLoadInfo;
        }

        // Start playback if needed (BEFORE preloading)
        if (shouldStartPlayback && session.queue.length > 0) {
            console.log(`[QueueManager] Starting immediate playback for first song in queue`);
            const firstSong = session.queue.shift(); // Remove from queue
            
            // Use ImmediateProcessor for instant playback with loading screen
            const { immediateProcessor } = await import('./immediate-processor.js');
            const processedSong = await immediateProcessor.processForImmediatePlayback(
                guildId, 
                firstSong, 
                djsClient, 
                session, 
                options
            );
            
            // Start playback with processed data
            const { player } = await import('../../handlers/core/player.js');
            await player.playSong(guildId, processedSong, djsClient, session, options.interactionDetails, options.displayPref);
        }
        
        // ALWAYS preload remaining songs in queue (even after immediate playback)
        if (shouldPreload && session.queue.length > 0) {
            console.log(`[QueueManager] Preloading ${session.queue.length} remaining songs in queue`);
            if (preloadOnlyNext) {
                // Only preload the first song in queue
                await preloader.preloadNextSongInQueue(guildId);
            } else {
                // Preload multiple songs (not recommended for memory)
                await preloader.preloadMultipleSongsInQueue(guildId, session.queue.length);
            }
        }

        // Clear querying state after successful queuing and preloading
        console.log(`[QueueManager] DEBUG: shouldStartPlayback=${shouldStartPlayback}, isQuerying=${isQuerying}, condition=${!shouldStartPlayback && isQuerying}`);
        if (!shouldStartPlayback && isQuerying) {
            console.log(`[QueueManager] Clearing querying state after successful queuing`);
            const { StateCoordinator } = await import('../../services/state-coordinator.js');
            await StateCoordinator.setIdleState(guildId);
        }

        // Emit queue changed event once (for UI updates only, not preloading)
        if (emitQueueChanged) {
            console.log(`[QueueManager] Emitting queueChanged for UI updates only (preloading handled internally)`);
            djsClient.emit('queueChanged', guildId, session);
        }

        return {
            addedCount: songs.length,
            totalQueueLength: session.queue.length,
            preloadedCount: preloadOnlyNext ? 1 : songs.length,
            startedPlayback: shouldStartPlayback
        };
    }

    /**
     * Add playlist to queue with lazy loading
     * @param {string} guildId - Guild ID
     * @param {Array} songs - Array of song objects
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     * @param {Object} playlistInfo - Playlist information
     */
    async addPlaylistToQueue(guildId, songs, djsClient, session, playlistInfo) {
        console.log(`[QueueManager] Adding playlist "${playlistInfo.name}" with ${songs.length} songs`);
        
        const maxInMemory = 3; // Keep only 3 songs in memory at a time
        
        if (songs.length > maxInMemory) {
            // Large playlist - use lazy loading
            console.log(`[QueueManager] Large playlist detected, using lazy loading strategy`);
            
            // Keep first few songs in memory
            const inMemorySongs = songs.slice(0, maxInMemory);
            const databaseSongs = songs.slice(maxInMemory);
            
            // Add in-memory songs to session queue
            session.queue.push(...inMemorySongs);
            
            // Save to database
            try {
                const { saveGuildQueue } = await import('../database/guildQueues.js');
                await saveGuildQueue(guildId, {
                    nowPlaying: session.nowPlaying,
                    queue: databaseSongs,
                    history: session.history || [],
                    lazyLoadInfo: {
                        inMemoryCount: inMemorySongs.length,
                        totalCount: inMemorySongs.length + databaseSongs.length, // Total remaining songs
                        lastUpdated: Date.now()
                    }
                });
                
                session.lazyLoadInfo = {
                    inMemoryCount: inMemorySongs.length,
                    totalCount: inMemorySongs.length + databaseSongs.length, // Total remaining songs
                    lastUpdated: Date.now()
                };
                
                console.log(`[QueueManager] Saved ${databaseSongs.length} songs to database, kept ${inMemorySongs.length} in memory`);
            } catch (dbError) {
                console.error(`[QueueManager] Failed to save playlist to database:`, dbError.message);
            }

            // CRITICAL FIX: Start playback for large playlists too!
            let startedPlayback = false;
            const isDiscordIdle = session?.player?.state?.status === 'idle';
            if (session.queue.length > 0 && !session.nowPlaying && (!session.isPlaying || isDiscordIdle)) {
                console.log(`[QueueManager] 🚀 Starting playback for large playlist - first song in queue`);
                const { player } = await import('../../handlers/core/player.js');
                const firstSong = session.queue.shift(); // Remove from queue
                
                // Do not set loading here; 'querying' will be handled earlier in the flow
                
                try {
                    await player.playSong(guildId, firstSong, djsClient, session, null, null);
                    startedPlayback = true;
                } catch (error) {
                    console.error(`[QueueManager] ❌ Failed to start playback: ${error.message}`);
                    if (error.code === 'DURATION_LIMIT_EXCEEDED') {
                        console.log(`[QueueManager] Song exceeded duration limit, skipping to next song`);
                        // Try to play the next song in queue
                        if (session.queue.length > 0) {
                            const nextSong = session.queue.shift();
                            
                            // Do not set loading here; 'querying' will be handled earlier in the flow
                            
                            try {
                                await player.playSong(guildId, nextSong, djsClient, session, null, null);
                                startedPlayback = true;
                            } catch (nextError) {
                                console.error(`[QueueManager] Next song also failed: ${nextError.message}`);
                            }
                        }
                    } else {
                        throw error; // Re-throw non-duration errors
                    }
                }
            }

            return {
                inMemoryCount: Math.min(songs.length, maxInMemory),
                databaseCount: Math.max(0, songs.length - maxInMemory),
                totalCount: songs.length,
                startedPlayback: startedPlayback
            };
        } else {
            // Small playlist - add all songs normally
            const result = await this.addSongsToQueue(guildId, songs, djsClient, session, {
                shouldPreload: true,
                preloadOnlyNext: true,
                emitQueueChanged: true,
                startPlayback: true
            });

            // IMMEDIATE PRELOAD: Start preloading the next song right after adding
            if (session.queue.length > 1) {
                console.log(`[QueueManager] 🚀 Starting immediate preload for next song after playlist addition`);
                await preloader.preloadNextSong(guildId, session);
            }

            return {
                inMemoryCount: songs.length,
                databaseCount: 0,
                totalCount: songs.length,
                startedPlayback: result.startedPlayback
            };
        }
    }


    /**
     * Load next batch of songs from database
     * FIXED: Track loaded songs to prevent duplicates
     */
    async loadNextBatchFromDatabase(guildId, session) {
        try {
            const { getGuildQueue } = await import('../database/guildQueues.js');
            const dbData = await getGuildQueue(guildId);
            
            console.log(`[QueueManager] 📊 Database state:`, {
                hasData: !!dbData,
                queueLength: dbData?.queue?.length || 0,
                hasLazyLoadInfo: !!dbData?.lazyLoadInfo,
                lazyLoadInfo: dbData?.lazyLoadInfo
            });
            
            if (dbData && dbData.queue && dbData.queue.length > 0) {
                // Initialize loaded songs tracking if not exists
                if (!session.loadedFromDatabase) {
                    session.loadedFromDatabase = new Set();
                }
                
                // Find songs that haven't been loaded yet
                const unloadedSongs = dbData.queue.filter(song => 
                    !session.loadedFromDatabase.has(song.query || song.title)
                );
                
                if (unloadedSongs.length === 0) {
                    console.log(`[QueueManager] All database songs have been loaded already`);
                    return;
                }
                
                // Load up to 3 more songs from database - LIGHTWEIGHT VERSION
                const songsToLoad = unloadedSongs.slice(0, 3);
                
                // Load songs from database - clean slate for new preloaded data system
                const loadedSongs = songsToLoad.map(song => ({
                    title: song.title || 'Unknown Title',
                    query: song.query || '',
                    addedBy: song.addedBy || 'Unknown User',
                    thumbnailUrl: song.thumbnailUrl || null,
                    // PRESERVE essential data for playback
                    spotifyData: song.spotifyData || null,
                    // Clear old preloaded data - will be recreated by new system
                    preloadedTempFile: null,
                    preloadedMetadata: null,
                    preloadCompleted: false,
                    isPreloading: false,
                    streamDetails: song.streamDetails || null,
                    metadata: song.metadata || null,
                    cachedData: song.cachedData || null,
                    originalSpotifyUrl: song.originalSpotifyUrl || null,
                    youtubeUrl: song.youtubeUrl || null,
                    actualYouTubeTitle: song.actualYouTubeTitle || null
                }));
                
                session.queue.push(...loadedSongs);
                
                // Track loaded songs to prevent duplicates
                songsToLoad.forEach(song => {
                    session.loadedFromDatabase.add(song.query || song.title);
                });
                
                // Update lazy load info
                session.lazyLoadInfo.inMemoryCount = session.queue.length;
                // Don't update totalCount - it should remain the same (total songs in playlist)
                session.lazyLoadInfo.lastUpdated = Date.now();
                
                // Update database with new lazyLoadInfo
                try {
                    const { saveGuildQueue, getGuildQueue } = await import('../database/guildQueues.js');
                    const dbData = await getGuildQueue(guildId);
                    if (dbData) {
                        await saveGuildQueue(guildId, {
                            ...dbData,
                            lazyLoadInfo: session.lazyLoadInfo
                        });
                    }
                } catch (dbError) {
                    console.error(`[QueueManager] Failed to update database lazyLoadInfo:`, dbError.message);
                }
                
                console.log(`[QueueManager] ✅ Loaded ${loadedSongs.length} songs from database:`, loadedSongs.map(s => s.title));
                console.log(`[QueueManager] Queue now has ${session.queue.length} songs total`);
                
                // FIXED: Don't remove songs from database - they should persist for future loading
                // The database queue should remain as a persistent source of songs
                console.log(`[QueueManager] ✅ Songs loaded from database, database queue remains intact for future loading`);
            }
        } catch (error) {
            console.error(`[QueueManager] Error loading from database:`, error.message);
        }
    }

    /**
     * Handle auto-advance when a song finishes
     */
    async handleAutoAdvance(guildId) {
        console.log(`[QueueManager] 🔄 AUTO-ADVANCE: Checking queue for guild ${guildId}`);
        
        try {
            const { getExistingSession } = await import('../core/audio-state.js');
            const session = getExistingSession(guildId);
            
            if (!session || !session.queue || session.queue.length === 0) {
                console.log(`[QueueManager] ⏹️ AUTO-ADVANCE: No songs in queue, staying idle`);
                return;
            }
            
            console.log(`[QueueManager] 🔄 AUTO-ADVANCE: Found ${session.queue.length} songs in queue, starting next song`);
            
            // Get the next song from queue
            const nextSong = session.queue.shift();
            console.log(`[QueueManager] 🎵 AUTO-ADVANCE: Playing next song "${nextSong.title}"`);
            
            // Check if song is preloaded
            if (preloader.isSongReady(nextSong)) {
                console.log(`[QueueManager] ✅ AUTO-ADVANCE: Song is preloaded, starting playback`);
                
                // Get preloaded data
                const preloadedData = preloader.getPreloadedData(guildId, nextSong.query);
                if (preloadedData) {
                    // Create stream details from preloaded data
                    nextSong.streamDetails = {
                        audioResource: preloadedData.audioResource,
                        tempFile: preloadedData.tempFile,
                        metadata: preloadedData.metadata
                    };
                    
                    // Get Discord client
                    const { ClientService } = await import('../../services/client-service.js');
                    const djsClient = ClientService.getClient();
                    
                    // Play the preloaded song
                    const { player } = await import('../../handlers/core/player.js');
                    await player.playSong(guildId, nextSong, djsClient, session, null, null);
                } else {
                    console.error(`[QueueManager] ❌ AUTO-ADVANCE: Preloaded data not available for "${nextSong.title}"`);
                }
            } else {
                console.log(`[QueueManager] ⚠️ AUTO-ADVANCE: Song not preloaded, processing with ImmediateProcessor`);
                
                // Use ImmediateProcessor for non-preloaded songs
                const { immediateProcessor } = await import('./immediate-processor.js');
                const { ClientService } = await import('../../services/client-service.js');
                const djsClient = ClientService.getClient();
                
                const processedSong = await immediateProcessor.processForImmediatePlayback(
                    guildId, 
                    nextSong, 
                    djsClient, 
                    session, 
                    {}
                );
                
                // Play the processed song
                const { player } = await import('../../handlers/core/player.js');
                await player.playSong(guildId, processedSong, djsClient, session, null, null);
            }
            
        } catch (error) {
            console.error(`[QueueManager] ❌ AUTO-ADVANCE error:`, error.message);
        }
    }

}

// Export singleton instance
export const queueManager = new QueueManager();