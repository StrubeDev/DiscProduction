// utils/cleanup-service.js
import fs from 'fs';
import { processManager } from './process-manager.js';
import { preloader } from './preloader.js';
import { fileNamingService } from './file-naming-service.js';

/**
 * Centralized Cleanup Service
 * Handles all cleanup operations for songs, processes, and resources
 */
class CleanupService {
    constructor() {
        console.log('[CleanupService] Service loaded successfully');
        
        // No more timer-based cleanup - files are deleted immediately when songs finish
        console.log('[CleanupService] ✅ Immediate cleanup mode enabled - no timer needed');
    }

    /**
     * Comprehensive cleanup for a finished song
     * This is the main cleanup function called when a song finishes playing
     */
    async cleanupFinishedSong(guildId, song, session = null) {
        if (!song) {
            console.log(`[CleanupService] No song provided for cleanup in guild ${guildId}`);
            return;
        }

        console.log(`[CleanupService] 🧹 CLEANING UP FINISHED SONG: "${song.title}" in guild ${guildId}`);
        
        try {
            // STEP 1: Clean up song object data
            await this.cleanupSongObject(song, true); // true = finished song, delete temp files
            
            // STEP 2: Clean up preload data
            preloader.cleanupSongPreload(song);
            
            // STEP 3: Clean up processes
            await processManager.comprehensiveSongCleanup(guildId, session?.audioResource);
            
            // STEP 4: Clear session references
            if (session) {
                if (session.nowPlaying === song) {
                    const { playerStateManager } = await import('../core/player-state-manager.js');
                    playerStateManager.clearNowPlaying(guildId);
                }
                // Session state is managed by playerStateManager
                // No need to set these directly
            }
            
            console.log(`[CleanupService] ✅ Successfully cleaned up finished song: "${song.title}"`);
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error cleaning up finished song:`, error.message);
        }
    }

    /**
     * Centralized handler for when a song finishes playing
     * This replaces all the scattered cleanup logic in audio-session.js
     */
    async handleSongFinish(guildId, session) {
        console.log(`[CleanupService] 🎵 HANDLING SONG FINISH: Starting comprehensive cleanup for guild ${guildId}`);
        
        try {
            // STEP 1: Clean up the finished song
            if (session?.nowPlaying) {
                await this.cleanupFinishedSong(guildId, session.nowPlaying, session);
            }
            
            // STEP 2: Handle queue advancement and lazy loading
            await this.handleQueueAdvancement(guildId, session);
            
            // STEP 3: Clean up distant queued songs (metadata only, not temp files)
            await this.cleanupDistantQueuedSongs(session);
            
            // STEP 4: Aggressive memory cleanup
            await this.performAggressiveCleanup(guildId);
            
            // STEP 5: Reset session state
            await this.resetSessionState(session);
            
            console.log(`[CleanupService] ✅ SONG FINISH HANDLING COMPLETE for guild ${guildId}`);
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error handling song finish:`, error.message);
        }
    }

    /**
     * Handle queue advancement and lazy loading after song finish
     */
    async handleQueueAdvancement(guildId, session) {
        if (!session?.queue || session.queue.length === 0) {
            return;
        }

        console.log(`[CleanupService] 🔄 QUEUE ADVANCEMENT: ${session.queue.length} songs in queue`);
        
        // Remove the next song from queue to prepare for next playback
        const nextSong = session.queue.shift();
        console.log(`[CleanupService] 🗑️ Removed next song from queue: "${nextSong?.title || 'Unknown'}"`);
        
        // Handle lazy loading if needed
        if (session.lazyLoadInfo && session.queue.length < 3) {
            try {
                const { queueManager } = await import('./queue-manager.js');
                await queueManager.loadNextBatchFromDatabase(guildId, session);
                console.log(`[CleanupService] ✅ Lazy loaded songs from database`);
            } catch (lazyLoadError) {
                console.error(`[CleanupService] ❌ Lazy loading failed:`, lazyLoadError.message);
            }
        }
    }

    /**
     * ULTRA AGGRESSIVE: Clean up ALL queued songs except the next one
     */
    async cleanupDistantQueuedSongs(session) {
        if (!session?.queue || session.queue.length <= 1) {
            return;
        }

        console.log(`[CleanupService] 🧹 ULTRA AGGRESSIVE QUEUE CLEANUP: ${session.queue.length} songs - keeping only next song`);
        
        // ULTRA AGGRESSIVE: Clean up ALL songs except the next one to play
        for (let i = 1; i < session.queue.length; i++) {
            const song = session.queue[i];
            if (song) {
                console.log(`[CleanupService] 🧹 AGGRESSIVELY CLEANING QUEUED SONG: "${song.title}"`);
                
                // AGGRESSIVE: Clear ALL heavy objects immediately
                if (song.streamDetails) {
                    if (song.streamDetails.audioResource) {
                        try {
                            if (song.streamDetails.audioResource.destroy) {
                                song.streamDetails.audioResource.destroy();
                            }
                        } catch (e) { /* ignore */ }
                        song.streamDetails.audioResource = null;
                    }
                    if (song.streamDetails.audioStream) {
                        try {
                            if (song.streamDetails.audioStream.destroy) {
                                song.streamDetails.audioStream.destroy();
                            }
                        } catch (e) { /* ignore */ }
                        song.streamDetails.audioStream = null;
                    }
                    if (song.streamDetails.ffmpegProcess) {
                        try {
                            if (!song.streamDetails.ffmpegProcess.killed) {
                                song.streamDetails.ffmpegProcess.kill('SIGTERM');
                            }
                        } catch (e) { /* ignore */ }
                        song.streamDetails.ffmpegProcess = null;
                    }
                    song.streamDetails = null;
                }
                
                // Clear ALL metadata and heavy objects
                song.spotifyData = null;
                song.preloadedTempFile = null;
                song.preloadedMetadata = null;
                song.processedTempFile = null;
                song.processedAudioResource = null;
                song.cachedData = null;
                song.originalSpotifyUrl = null;
                song.youtubeUrl = null;
                song.actualYouTubeTitle = null;
                song.processedVolume = null;
                song.ytDlpProcess = null;
                song.ffmpegProcess = null;
                song.preloadCompleted = false;
                song.isPreloading = false;
            }
        }
        
        console.log(`[CleanupService] ✅ ULTRA AGGRESSIVE: Cleaned up ${session.queue.length - 1} queued songs - only next song kept intact`);
    }

    /**
     * Perform aggressive memory cleanup
     */
    async performAggressiveCleanup(guildId) {
        console.log(`[CleanupService] 🧹 AGGRESSIVE CLEANUP: Running aggressive cleanup for guild ${guildId}`);
        
        try {
            // Clean up process manager data
            const { processManager } = await import('./process-manager.js');
            processManager.cleanupOldProcessData();
            
            // Kill memory-consuming processes
            const memoryConsumers = processManager.getMemoryConsumingProcesses(20);
            if (memoryConsumers.length > 0) {
                await processManager.killMemoryConsumingProcesses(20);
            }
            
            // Clean up unified service data
            const { unifiedYtdlpService } = await import('../processors/unified-ytdlp-service.js');
            unifiedYtdlpService.cleanupStaleQueries();
            
            // Clean up recently completed queries
            const now = Date.now();
            for (const [query, timestamp] of unifiedYtdlpService.recentlyCompletedQueries) {
                if (now - timestamp > 10000) {
                    unifiedYtdlpService.recentlyCompletedQueries.delete(query);
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
        } catch (error) {
            console.warn(`[CleanupService] Error during aggressive cleanup:`, error.message);
        }
    }

    /**
     * Reset session state after song finish
     * NOTE: This method only handles cleanup-related state, not playback state
     * Playback state is managed by the player and playerStateManager
     */
    async resetSessionState(session) {
        if (!session) return;
        
        console.log(`[CleanupService] 🔄 RESETTING SESSION STATE (cleanup only)`);
        
        // Update lazy load info
        if (session.lazyLoadInfo) {
            session.lazyLoadInfo.inMemoryCount = session.queue?.length || 0;
            session.lazyLoadInfo.lastUpdated = Date.now();
        }
        
        console.log(`[CleanupService] ✅ Session state reset completed (playback state managed by player)`);
    }

    /**
     * Clean up a song object (used for both finished and queued songs)
     */
    async cleanupSongObject(song, isFinishedSong = false, guildId = null) {
        if (!song) return;
        
        console.log(`[CleanupService] 🧹 CLEANING SONG OBJECT: "${song.title}" (finished: ${isFinishedSong})`);
        
        // STEP 1: DELETE TEMP FILES FIRST (before clearing the song object)
        if (isFinishedSong) {
            console.log(`[CleanupService] 🗑️ DELETING TEMP FILES FIRST for finished song: "${song.title}"`);
            await this.cleanupTempFiles(song);
        } else {
            console.log(`[CleanupService] ⏭️ SKIPPING TEMP FILE CLEANUP for queued song: "${song.title}"`);
        }
        
        // STEP 2: Clear stream details
        if (song.streamDetails) {
            if (song.streamDetails.audioResource) {
                try {
                    if (song.streamDetails.audioResource.destroy) {
                        song.streamDetails.audioResource.destroy();
                    }
                } catch (e) { /* ignore */ }
                song.streamDetails.audioResource = null;
            }
            if (song.streamDetails.audioStream) {
                try {
                    if (song.streamDetails.audioStream.destroy) {
                        song.streamDetails.audioStream.destroy();
                    }
                } catch (e) { /* ignore */ }
                song.streamDetails.audioStream = null;
            }
            if (song.streamDetails.ffmpegProcess) {
                try {
                    if (!song.streamDetails.ffmpegProcess.killed) {
                        song.streamDetails.ffmpegProcess.kill('SIGTERM');
                    }
                } catch (e) { /* ignore */ }
                song.streamDetails.ffmpegProcess = null;
            }
            song.streamDetails = null;
        }
        
        // STEP 3: Clear process references
        if (song.ytDlpProcess) {
            try {
                if (!song.ytDlpProcess.killed) {
                    song.ytDlpProcess.kill('SIGTERM');
                }
            } catch (e) { /* ignore */ }
            song.ytDlpProcess = null;
        }
        if (song.ffmpegProcess) {
            try {
                if (!song.ffmpegProcess.killed) {
                    song.ffmpegProcess.kill('SIGTERM');
                }
            } catch (e) { /* ignore */ }
            song.ffmpegProcess = null;
        }
        
        // STEP 4: Clear heavy metadata
        if (song.spotifyData) {
            console.log(`[CleanupService] 🧹 Clearing spotifyData (${JSON.stringify(song.spotifyData).length} bytes)`);
            song.spotifyData = null;
        }
        
        // STEP 5: Clear preloaded data to prevent memory leaks
        if (song.preloadedTempFile) {
            console.log(`[CleanupService] 🧹 Clearing preloadedTempFile`);
            song.preloadedTempFile = null;
        }
        if (song.preloadedMetadata) {
            console.log(`[CleanupService] 🧹 Clearing preloadedMetadata`);
            song.preloadedMetadata = null;
        }
        if (song.preloadCompleted) {
            song.preloadCompleted = false;
        }
        if (song.isPreloading) {
            song.isPreloading = false;
        }
        
        // Clear from per-guild preloaded data storage
        if (guildId && song.query) {
            const { preloader } = await import('./preloader.js');
            preloader.cleanupSongPreloadedData(guildId, song.query);
        }
        
        // Clear streamDetails metadata specifically
        if (song.streamDetails?.metadata) {
            console.log(`[CleanupService] 🧹 Clearing streamDetails.metadata`);
            song.streamDetails.metadata = null;
        }
        
        // STEP 6: Clear additional metadata fields that might be retained
        if (song.cachedData) {
            console.log(`[CleanupService] 🧹 Clearing cachedData`);
            song.cachedData = null;
        }
        if (song.originalSpotifyUrl) {
            console.log(`[CleanupService] 🧹 Clearing originalSpotifyUrl`);
            song.originalSpotifyUrl = null;
        }
        if (song.youtubeUrl) {
            console.log(`[CleanupService] 🧹 Clearing youtubeUrl`);
            song.youtubeUrl = null;
        }
        if (song.actualYouTubeTitle) {
            console.log(`[CleanupService] 🧹 Clearing actualYouTubeTitle`);
            song.actualYouTubeTitle = null;
        }
        if (song.processedTempFile) {
            console.log(`[CleanupService] 🧹 Clearing processedTempFile`);
            song.processedTempFile = null;
        }
        if (song.processedAudioResource) {
            console.log(`[CleanupService] 🧹 Clearing processedAudioResource`);
            song.processedAudioResource = null;
        }
        if (song.processedVolume) {
            console.log(`[CleanupService] 🧹 Clearing processedVolume`);
            song.processedVolume = null;
        }
        
        console.log(`[CleanupService] ✅ Song object cleaned up: "${song.title}"`);
    }

    /**
     * Clean up temp files for a finished song
     */
    async cleanupTempFiles(song) {
        console.log(`[CleanupService] 🗑️ CLEANING TEMP FILES for finished song: "${song.title}"`);
        console.log(`[CleanupService] 🧹 Song object keys:`, Object.keys(song));
        console.log(`[CleanupService] 🧹 Song streamDetails:`, song.streamDetails ? Object.keys(song.streamDetails) : 'null');
        
        // Check if we're running in Docker
        const isDocker = process.env.DOCKER_ENV === 'true';
        if (isDocker) {
            console.log(`[CleanupService] 🐳 Docker environment detected - using enhanced cleanup strategy`);
        }
        
        // Collect ALL possible temp file paths from song object
        const tempFileSources = [
            song.tempFile,
            song.streamDetails?.tempFile,
            song.preloadedTempFile,
            song.processedTempFile,
            song.streamDetails?.audioResource?._tempFile,
            song.streamDetails?.audioResource?._processedTempFile
        ];
        
        console.log(`[CleanupService] 🧹 Raw temp file sources:`, tempFileSources);
        
        const tempFilesToDelete = [];
        
        // Add temp files and ALL their possible processed variants
        for (const tempFile of tempFileSources) {
            if (tempFile) {
                tempFilesToDelete.push(tempFile);
                console.log(`[CleanupService] 🧹 Found temp file: ${tempFile}`);
                
                // Use centralized naming service to get all file variants
                const processedVariants = fileNamingService.getAllFileVariants(tempFile);
                
                // Add all variants
                for (const variant of processedVariants) {
                    if (variant && variant !== tempFile) {
                        tempFilesToDelete.push(variant);
                        console.log(`[CleanupService] 🧹 Added processed variant: ${variant}`);
                    }
                }
            }
        }
        
        // Delete all temp files (raw + processed) using centralized service
        console.log(`[CleanupService] 🗑️ TEMP FILE CLEANUP: Found ${tempFilesToDelete.length} temp files to delete:`, tempFilesToDelete);
        
        // Use centralized file deletion service for better Docker handling
        const { fileDeletionService } = await import('./file-deletion-service.js');
        const result = fileDeletionService.deleteFiles(tempFilesToDelete, `song cleanup: ${song.title}`);
        
        console.log(`[CleanupService] ✅ Temp file cleanup completed for: "${song.title}" - Result:`, result);
    }

    /**
     * Clean up all resources for a guild (used when bot disconnects)
     */
    async cleanupGuildResources(guildId, session = null) {
        console.log(`[CleanupService] 🧹 CLEANING UP ALL RESOURCES for guild ${guildId}`);
        
        try {
            // Clean up current song if playing
            if (session?.nowPlaying) {
                await this.cleanupFinishedSong(guildId, session.nowPlaying, session);
            }
            
            // Clean up queued songs (but don't delete temp files yet)
            if (session?.queue) {
                for (const song of session.queue) {
                    await this.cleanupSongObject(song, false); // false = don't delete temp files yet
                }
            }
            
            // Clean up preloader data
            preloader.cleanupGuildPreloads(guildId);
            
            // Clean up processes
            await processManager.comprehensiveSongCleanup(guildId, session?.audioResource);
            
            console.log(`[CleanupService] ✅ Guild resources cleaned up for guild ${guildId}`);
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error cleaning up guild resources:`, error.message);
        }
    }

    /**
     * Clean up a specific song from queue (used when skipping)
     */
    async cleanupQueuedSong(song) {
        if (!song) return;
        
        console.log(`[CleanupService] 🧹 CLEANING QUEUED SONG: "${song.title}"`);
        
        // Clean up song object but don't delete temp files (song might be preloaded)
        await this.cleanupSongObject(song, false);
        
        console.log(`[CleanupService] ✅ Queued song cleaned up: "${song.title}"`);
    }

    /**
     * Force garbage collection and memory cleanup
     */
    forceMemoryCleanup() {
        console.log(`[CleanupService] 🗑️ FORCING MEMORY CLEANUP`);
        
        if (global.gc) {
            console.log(`[CleanupService] 🗑️ Running garbage collection`);
            global.gc();
        } else {
            console.log(`[CleanupService] ⚠️ Garbage collection not available - run with --expose-gc`);
        }
    }

    /**
     * Clean up guild command data (moved from commands/play.js)
     */
    cleanupGuildCommandData(guildId) {
        console.log(`[CleanupService] Cleaning up command data for guild ${guildId}`);
        
        // This would clean up any command-specific data
        // Currently just a placeholder for future command cleanup
    }

    /**
     * Clean up old command data (moved from commands/play.js)
     */
    cleanupOldCommandData() {
        console.log(`[CleanupService] Cleaning up old command data`);
        
        // This would clean up any old command data
        // Currently just a placeholder for future command cleanup
    }

    /**
     * Clean up guild processes (moved from commands/play.js)
     */
    cleanupGuildProcesses(guildId) {
        console.log(`[CleanupService] Cleaning up processes for guild ${guildId}`);
        
        // This would clean up any guild-specific processes
        // Currently just a placeholder for future process cleanup
    }

    /**
     * Clean up Maps after each song finishes (moved from audio-session.js)
     */
    async cleanupSongFinishMaps(guildId) {
        const startTime = Date.now();
        const memBefore = process.memoryUsage();
        
        console.log(`[CleanupService] 🧹 SONG FINISH CLEANUP: Cleaning Maps after song finished for guild ${guildId}`);
        console.log(`[CleanupService] Memory before cleanup: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);
        
        try {
            // Clean up process manager - remove old process data
            processManager.cleanupOldProcessData();
            
            // Clean up unified ytdlp service - remove old queries
            const { unifiedYtdlpService } = await import('./unified-ytdlp-service.js');
            unifiedYtdlpService.cleanupStaleQueries();
            
            // Force cleanup of recently completed queries
            const now = Date.now();
            for (const [query, timestamp] of unifiedYtdlpService.recentlyCompletedQueries) {
                if (now - timestamp > 5000) { // 5 seconds - more aggressive cleanup
                    unifiedYtdlpService.recentlyCompletedQueries.delete(query);
                }
            }
            
            // STREAMLINED GARBAGE COLLECTION: Single efficient GC call
            this.forceMemoryCleanup();
            
            const memAfter = process.memoryUsage();
            const memFreed = memBefore.heapUsed - memAfter.heapUsed;
            const cleanupTime = Date.now() - startTime;
            
            console.log(`[CleanupService] ✅ SONG FINISH CLEANUP COMPLETE for guild ${guildId}`);
            console.log(`[CleanupService] Heap before: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB, after: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB`);
            console.log(`[CleanupService] Memory freed: ${Math.round(memFreed / 1024 / 1024)}MB in ${cleanupTime}ms`);
            
        } catch (error) {
            console.error(`[CleanupService] Error during song finish cleanup:`, error);
        }
    }

    /**
     * Comprehensive cleanup for all Maps when a guild disconnects (moved from audio-session.js)
     */
    async cleanupAllGuildMaps(guildId) {
        console.log(`[CleanupService] 🧹 COMPREHENSIVE MAP CLEANUP: Cleaning all Maps for guild ${guildId}`);
        
        try {
            // Clean up process manager
            processManager.cleanupGuildData(guildId);
            
            // Clean up unified ytdlp service
            const { unifiedYtdlpService } = await import('./unified-ytdlp-service.js');
            unifiedYtdlpService.cleanupGuildData(guildId);
            
            // Clean up menu component handlers
            const { cleanupGuildMaps } = await import('../ui/services/cleanup-utils.js');
            cleanupGuildMaps(guildId);
            
            // Clean up message manager
            const { cleanupGuildMessageLocks } = await import('./helpers/message-helpers.js');
            cleanupGuildMessageLocks(guildId);
            
            // Clean up rate limiting
            const { cleanupGuildRateLimit } = await import('./rateLimiting.js');
            cleanupGuildRateLimit(guildId);
            
            // Clean up queue saver
            const { queueSaver } = await import('./queue-saver.js');
            queueSaver.cleanupGuildData(guildId);
            
            // Clean up pending queue
            const { cleanupGuildPendingQueue } = await import('./pending-queue.js');
            cleanupGuildPendingQueue(guildId);
            
            // Clean up commands
            this.cleanupGuildCommandData(guildId);
            
            // Clean up loading states
            const { unifiedLoadingService } = await import('./unified-loading-service.js');
            unifiedLoadingService.cleanupGuildLoadingState(guildId);
            
            console.log(`[CleanupService] ✅ COMPREHENSIVE MAP CLEANUP COMPLETE for guild ${guildId}`);
        } catch (error) {
            console.error(`[CleanupService] Error during comprehensive map cleanup:`, error);
        }
    }

    /**
     * Comprehensive cleanup when player is stopped (moved from audio-session.js)
     */
    async performComprehensiveStopCleanup(guildId, session, reason = 'manual stop') {
        console.log(`[CleanupService] 🧹 COMPREHENSIVE STOP CLEANUP: Starting complete cleanup for guild ${guildId} (${reason})`);
        
        try {
            // Use our centralized cleanup
            await this.cleanupGuildResources(guildId, session);
            console.log(`[CleanupService] ✅ Comprehensive cleanup completed for guild ${guildId}`);
            
            // Clean up Maps
            await this.cleanupSongFinishMaps(guildId);
            
        } catch (error) {
            console.error(`[CleanupService] Error during comprehensive stop cleanup:`, error);
        }
    }

    /**
     * Force cleanup of all temp files immediately (regardless of age)
     * This is called when we want to clean up files right away
     */
    async forceCleanupAllTempFiles() {
        try {
            console.log(`[CleanupService] 🗑️ FORCE CLEANING ALL TEMP FILES`);
            
            const { readdir, existsSync, mkdirSync } = await import('fs');
            const { promisify } = await import('util');
            const readdirAsync = promisify(readdir);
            
            // Ensure temp directory exists
            if (!existsSync('temp')) {
                try {
                    mkdirSync('temp', { recursive: true });
                    console.log('[CleanupService] Created temp directory');
                } catch (error) {
                    console.error('[CleanupService] Failed to create temp directory:', error.message);
                    return;
                }
            }
            
            // Check temp directory for temp files
            const searchPaths = ['./temp'];
            let allFiles = [];
            
            for (const searchPath of searchPaths) {
                try {
                    const files = await readdirAsync(searchPath);
                    allFiles = allFiles.concat(files.map(file => `${searchPath}/${file}`));
                } catch (dirError) {
                    console.log(`[CleanupService] Could not read directory ${searchPath}:`, dirError.message);
                }
            }
            
            // Filter for temp audio files using centralized naming service
            const tempFiles = allFiles.filter(file => fileNamingService.isTempAudioFile(file));
            
            console.log(`[CleanupService] Found ${tempFiles.length} temp files to force delete`);
            
            // Use centralized file deletion service for better Docker handling
            if (tempFiles.length > 0) {
                const { fileDeletionService } = await import('./file-deletion-service.js');
                const result = fileDeletionService.deleteFiles(tempFiles, 'force cleanup all temp files');
                console.log(`[CleanupService] ✅ Force cleanup result:`, result);
            } else {
                console.log(`[CleanupService] ✅ No temp files found to force clean`);
            }
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error force cleaning temp files:`, error.message);
        }
    }

    /**
     * Clean up old temp files that are no longer needed
     * This runs periodically to prevent temp file accumulation
     * Enhanced for Docker container compatibility
     */
    async cleanupOldTempFiles() {
        try {
            console.log(`[CleanupService] 🧹 CLEANING UP OLD TEMP FILES`);
            
            const { readdir, stat, unlink, existsSync, mkdirSync } = await import('fs');
            const { promisify } = await import('util');
            const readdirAsync = promisify(readdir);
            const statAsync = promisify(stat);
            const unlinkAsync = promisify(unlink);
            
            // Ensure temp directory exists
            if (!existsSync('temp')) {
                try {
                    mkdirSync('temp', { recursive: true });
                    console.log('[CleanupService] Created temp directory');
                } catch (error) {
                    console.error('[CleanupService] Failed to create temp directory:', error.message);
                    return;
                }
            }
            
            // Check temp directory for temp files
            const searchPaths = ['./temp'];
            let allFiles = [];
            
            for (const searchPath of searchPaths) {
                try {
                    const files = await readdirAsync(searchPath);
                    allFiles = allFiles.concat(files.map(file => `${searchPath}/${file}`));
                } catch (dirError) {
                    console.log(`[CleanupService] Could not read directory ${searchPath}:`, dirError.message);
                }
            }
            
            // Filter for temp audio files using centralized naming service
            const tempFiles = allFiles.filter(file => fileNamingService.isTempAudioFile(file));
            
            console.log(`[CleanupService] Found ${tempFiles.length} temp files to check`);
            
            const now = Date.now();
            const isDocker = process.env.DOCKER_ENV === 'true';
            const maxAge = isDocker ? 2 * 60 * 1000 : 1 * 60 * 1000; // 2 minutes in Docker, 1 minute otherwise (more aggressive)
            const filesToDelete = [];
            
            console.log(`[CleanupService] Checking ${tempFiles.length} temp files (max age: ${Math.round(maxAge / 1000)}s, Docker: ${isDocker})`);
            
            for (const file of tempFiles) {
                try {
                    const stats = await statAsync(file);
                    const age = now - stats.mtime.getTime();
                    
                    // Delete files older than maxAge
                    if (age > maxAge) {
                        filesToDelete.push(file);
                        console.log(`[CleanupService] 🗑️ Marked for deletion: ${file} (age: ${Math.round(age / 1000)}s)`);
                    } else {
                        console.log(`[CleanupService] ⏳ File too new to delete: ${file} (age: ${Math.round(age / 1000)}s, need ${Math.round(maxAge / 1000)}s)`);
                    }
                } catch (fileError) {
                    console.warn(`[CleanupService] ⚠️ Could not process file ${file}:`, fileError.message);
                }
            }
            
            // Use centralized file deletion service for better Docker handling
            if (filesToDelete.length > 0) {
                const { fileDeletionService } = await import('./file-deletion-service.js');
                const result = fileDeletionService.deleteFiles(filesToDelete, 'old temp file cleanup');
                console.log(`[CleanupService] ✅ Old temp file cleanup result:`, result);
            } else {
                console.log(`[CleanupService] ✅ No old temp files found to clean up`);
            }
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error cleaning up old temp files:`, error.message);
        }
    }

    /**
     * Clean up all guild processes (used during shutdown)
     */
    async cleanupAllGuildProcesses() {
        console.log(`[CleanupService] 🧹 CLEANING UP ALL GUILD PROCESSES`);
        
        try {
            // Get all active guild sessions
            const { guildAudioSessions } = await import('../core/audio-state.js');
            const activeGuilds = Array.from(guildAudioSessions.keys());
            
            console.log(`[CleanupService] Found ${activeGuilds.length} active guilds to clean up`);
            
            // Clean up each guild
            for (const guildId of activeGuilds) {
                try {
                    const session = guildAudioSessions.get(guildId);
                    await this.cleanupAudioSession(guildId);
                    console.log(`[CleanupService] ✅ Cleaned up guild ${guildId}`);
                } catch (guildError) {
                    console.error(`[CleanupService] ❌ Error cleaning up guild ${guildId}:`, guildError.message);
                }
            }
            
            // Force cleanup of all temp files
            await this.forceCleanupAllTempFiles();
            
            console.log(`[CleanupService] ✅ All guild processes cleaned up`);
            
        } catch (error) {
            console.error(`[CleanupService] ❌ Error cleaning up all guild processes:`, error.message);
        }
    }

    /**
     * Clean up audio session (moved from audio-session.js)
     */
    async cleanupAudioSession(guildId) {
        const { getExistingSession } = await import('../core/audio-state.js');
        const session = getExistingSession(guildId);
        if (!session) return;

        try {
            console.log(`[CleanupService] Starting comprehensive cleanup for guild ${guildId}`);
            
            // Stop player and remove ALL listeners
            if (session.player) {
                session.player.removeAllListeners();
                session.player.stop();
                console.log(`[CleanupService] ✅ Removed all player event listeners for guild ${guildId}`);
            }
            
            // Clean up audio resource
            if (session.audioResource) {
                session.audioResource = null;
            }
            
            // Clean up nowPlaying object
            if (session.nowPlaying) {
                await this.cleanupSongObject(session.nowPlaying, true); // true = finished song, delete temp files
                const { playerStateManager } = await import('../core/player-state-manager.js');
                playerStateManager.clearNowPlaying(guildId);
            }
            
            // Clean up queue objects
            if (session.queue && session.queue.length > 0) {
                for (const song of session.queue) {
                    await this.cleanupSongObject(song, false); // false = queue song, preserve preloaded files
                }
                session.queue = [];
            }
            
            // Clear database queue when session ends
            try {
                const { saveGuildQueue } = await import('./database/guildQueues.js');
                await saveGuildQueue(guildId, { 
                    nowPlaying: null, 
                    queue: [], 
                    history: session.history || [], 
                    lazyLoadInfo: null 
                });
                console.log(`[CleanupService] ✅ Cleared database queue for guild ${guildId}`);
            } catch (dbError) {
                console.log(`[CleanupService] Database cleanup error:`, dbError.message);
            }
            
            // Kill all processes for this guild
            await processManager.comprehensiveSongCleanup(guildId, session?.audioResource);
            
            // Destroy voice connection and remove ALL listeners
            if (session.connection) {
                session.connection.removeAllListeners();
                session.connection.destroy();
                console.log(`[CleanupService] ✅ Removed all connection event listeners for guild ${guildId}`);
            }
            
            // Reset event listener flag and clear session data
            if (session.eventListenersAttached) {
                session.eventListenersAttached = false;
                console.log(`[CleanupService] ✅ Reset event listener flag for guild ${guildId}`);
            }
            
            const { guildAudioSessions } = await import('../core/audio-state.js');
            guildAudioSessions.delete(guildId);
            
            // COMPREHENSIVE CLEANUP: Clean up all Maps across the entire application
            await this.cleanupAllGuildMaps(guildId);
            
            // Check memory usage after comprehensive cleanup (event-driven)
            const { checkMemoryUsage } = await import('../handlers/common/audio-session.js');
            checkMemoryUsage();
            
            console.log(`[CleanupService] Comprehensive cleanup completed for guild ${guildId}`);
        } catch (error) {
            console.error(`[CleanupService] Error during cleanup:`, error);
        }
    }
}

export const cleanupService = new CleanupService();
