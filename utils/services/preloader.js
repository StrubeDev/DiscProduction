import { unifiedYtdlpService } from '../processors/unified-ytdlp-service.js';
import { getExistingSession } from '../core/audio-state.js';

class Preloader {
    constructor() {
        this.preloadInProgress = new Map(); // guildId -> Set of song titles being preloaded
        this.preloadPromises = new Map(); // guildId -> Map of song titles to promises
        this.guildPreloadedData = new Map(); // guildId -> Map of song queries to preloaded data
    }

    /**
     * Start preloading a song in the background
     * This should be called immediately when songs are added to the queue
     */
    async startPreloadForSong(song, guildId) {
        console.log(`[Preloader] 🔍 startPreloadForSong called for: "${song?.title || 'unknown'}"`);
        
        if (!song || song.isPreloading || song.preloadCompleted) {
            console.log(`[Preloader] ⏭️ Skipping preload - already preloading or completed`);
            return; // Already preloading or completed
        }
        
        // Check if we're already preloading this song
        if (!this.preloadInProgress.has(guildId)) {
            this.preloadInProgress.set(guildId, new Set());
        }
        
        const guildPreloads = this.preloadInProgress.get(guildId);
        if (guildPreloads.has(song.title)) {
            console.log(`[Preloader] Song "${song.title}" is already being preloaded for guild ${guildId}`);
            return;
        }

        // Mark as preloading
        guildPreloads.add(song.title);
        song.isPreloading = true;
        
        console.log(`[Preloader] 🚀 Starting preload for: "${song.title}"`);
        
        try {
            // Get current volume from session
            const session = getExistingSession(guildId);
            const currentVolume = session?.volume || 100;
            
            // Use unified service to download audio only (no heavy objects)
            const downloadResult = await unifiedYtdlpService.downloadAudioOnly(song.query, guildId);
            
            // Store preloaded data per-guild to prevent cross-song contamination
            if (!this.guildPreloadedData.has(guildId)) {
                this.guildPreloadedData.set(guildId, new Map());
            }
            
            const guildPreloadedData = this.guildPreloadedData.get(guildId);
            guildPreloadedData.set(song.query, {
                tempFile: downloadResult.tempFile,
                metadata: {
                    title: downloadResult.metadata?.title || song.title,
                    duration: downloadResult.metadata?.duration || song.duration || 0,
                    thumbnail: downloadResult.metadata?.thumbnail || null,
                    url: song.query // Store the query for validation
                }
            });
            
            // LIGHTWEIGHT: Only store minimal data on song object
            song.preloadCompleted = true;
            song.isPreloading = false;
            
            // Audio processing should NOT touch thumbnails - that's for display logic only
            // The preloader only handles audio file preparation, not image processing
            console.log(`[Preloader] ✅ Audio processing completed - thumbnails left untouched`);
            
            // DO NOT store heavy objects on song - keep them in guild-scoped storage only
            console.log(`[Preloader] ✅ Preload completed - heavy data stored separately, song object kept lightweight`);
            
            console.log(`[Preloader] ✅ Stored preloaded data for guild ${guildId}, query: ${song.query}`);
            
            // CRITICAL: Process the preloaded file immediately with current volume
            try {
                console.log(`[Preloader] 🔄 Processing preloaded file with volume ${currentVolume}% for: "${song.title}"`);
                
                // Check if the temp file actually exists
                const { existsSync } = await import('fs');
                if (!existsSync(downloadResult.tempFile)) {
                    throw new Error(`Preloaded temp file does not exist: ${downloadResult.tempFile}`);
                }
                
                const streamData = await unifiedYtdlpService.getAudioStreamFromTempFile(
                    downloadResult.tempFile, 
                    guildId, 
                    currentVolume, 
                    song.preloadedMetadata
                );
                
                // Store the processed file path and volume used
                song.processedTempFile = streamData.processedTempFile; // Use the actual processed file path
                song.processedAudioResource = streamData.audioResource;
                song.processedVolume = currentVolume; // Store the volume used for processing
                
                console.log(`[Preloader] ✅ Processed file created: ${song.processedTempFile}`);
                console.log(`[Preloader] ✅ Preload data stored: processedAudioResource=${!!song.processedAudioResource}, processedTempFile=${song.processedTempFile}`);
            } catch (processError) {
                console.error(`[Preloader] ❌ Failed to process preloaded file for "${song.title}":`, processError.message);
                console.error(`[Preloader] ❌ Process error details:`, processError);
                
                // Clean up the failed preloaded file from both song object and guild storage
                song.preloadedTempFile = null;
                song.preloadedMetadata = null;
                song.preloadCompleted = false;
                
                // Also clean up from guild storage
                const guildPreloadedData = this.guildPreloadedData.get(guildId);
                if (guildPreloadedData) {
                    guildPreloadedData.delete(song.query);
                }
                
                // Continue without processed file - will be created during playback
            }
            
            console.log(`[Preloader] ✅ Preload completed for: "${song.title}" - File ready for instant playback`);
        } catch (error) {
            console.error(`[Preloader] ❌ Preload failed for "${song.title}":`, error.message);
            song.isPreloading = false;
            song.preloadCompleted = false;
        } finally {
            // Remove from preloading set
            guildPreloads.delete(song.title);
        }
    }

    /**
     * Preload the next song in queue immediately
     * This should be called right after adding songs to the queue
     */
    async preloadNextSong(guildId, session) {
        if (!session.queue || session.queue.length === 0) {
            console.log(`[Preloader] No songs in queue to preload for guild ${guildId}`);
            return;
        }

        const nextSong = session.queue[0];
        
        // Check if already preloading or preloaded
        if (nextSong.isPreloading || nextSong.preloadCompleted || nextSong.processedTempFile) {
            console.log(`[Preloader] Next song "${nextSong.title}" already preloaded or being preloaded`);
            return;
        }

        // Start preloading immediately
        await this.startPreloadForSong(nextSong, guildId);
    }

    /**
     * Preload multiple songs in the queue (for playlists)
     * This should be called when adding playlists to the queue
     */
    async preloadQueueSongs(guildId, session, maxPreload = 3) {
        if (!session.queue || session.queue.length === 0) {
            console.log(`[Preloader] No songs in queue to preload for guild ${guildId}`);
            return;
        }

        console.log(`[Preloader] 🚀 Starting preload for up to ${maxPreload} songs in queue`);
        
        const songsToPreload = session.queue.slice(0, maxPreload);
        const preloadPromises = songsToPreload.map(song => this.startPreloadForSong(song, guildId));
        
        try {
            await Promise.allSettled(preloadPromises);
            console.log(`[Preloader] ✅ Completed preloading ${songsToPreload.length} songs`);
        } catch (error) {
            console.error(`[Preloader] ❌ Some preloads failed:`, error.message);
        }
    }

    /**
     * Check if a song is ready for instant playback
     */
    isSongReady(song) {
        // LIGHTWEIGHT: Only check if preload is completed, not heavy objects
        const isReady = song && song.preloadCompleted;
        
        if (song) {
            console.log(`[Preloader] 🔍 isSongReady check for "${song.title}":`, {
                hasSong: !!song,
                preloadCompleted: song.preloadCompleted,
                isReady: isReady
            });
        }
        
        return isReady;
    }

    /**
     * Get preloaded audio resource for instant playback
     */
    getPreloadedAudioResource(song) {
        // This method is deprecated - use getPreloadedData instead
        console.warn(`[Preloader] ⚠️ getPreloadedAudioResource is deprecated - use getPreloadedData instead`);
        return null;
    }

    /**
     * Clean up preload data for a song
     */
    cleanupSongPreload(song) {
        if (song) {
            song.isPreloading = false;
            song.preloadCompleted = false;
            song.preloadedTempFile = null;
            song.processedTempFile = null;
            song.processedAudioResource = null;
            song.preloadedMetadata = null;
        }
    }

    /**
     * Clean up all preload data for a guild
     */
    cleanupGuildPreloads(guildId) {
        this.preloadInProgress.delete(guildId);
        this.preloadPromises.delete(guildId);
        this.guildPreloadedData.delete(guildId);
        console.log(`[Preloader] Cleaned up all preload data for guild ${guildId}`);
    }

    /**
     * ULTRA AGGRESSIVE: Clean up old preloaded data to prevent memory leaks
     */
    cleanupOldPreloadedData() {
        const now = Date.now();
        const maxAge = 60 * 1000; // 1 minute - ULTRA aggressive
        
        let cleanedCount = 0;
        
        // Clean up old preloaded data
        for (const [guildId, guildData] of this.guildPreloadedData) {
            for (const [query, data] of guildData) {
                if (data.timestamp && now - data.timestamp > maxAge) {
                    guildData.delete(query);
                    cleanedCount++;
                }
            }
            
            // If guild has no preloaded data, remove the guild entry
            if (guildData.size === 0) {
                this.guildPreloadedData.delete(guildId);
                this.preloadInProgress.delete(guildId);
                this.preloadPromises.delete(guildId);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[Preloader] 🧹 ULTRA AGGRESSIVE CLEANUP: Cleaned up ${cleanedCount} old preloaded entries`);
        }
    }

    /**
     * Clean up preloaded data for a specific song query in a guild
     */
    cleanupSongPreloadedData(guildId, songQuery) {
        const guildPreloadedData = this.guildPreloadedData.get(guildId);
        if (guildPreloadedData) {
            guildPreloadedData.delete(songQuery);
            console.log(`[Preloader] Cleaned up preloaded data for guild ${guildId}, query: ${songQuery}`);
        }
    }

    /**
     * Get preloaded data for a specific song query in a guild
     */
    getPreloadedData(guildId, songQuery) {
        const guildPreloadedData = this.guildPreloadedData.get(guildId);
        if (guildPreloadedData) {
            return guildPreloadedData.get(songQuery);
        }
        return null;
    }

    /**
     * Preload the next song in queue for a guild
     */
    async preloadNextSongInQueue(guildId) {
        console.log(`[Preloader] 🔄 Preloading next song in queue for guild ${guildId}`);
        
        try {
            const { getExistingSession } = await import('../core/audio-state.js');
            const session = getExistingSession(guildId);
            
            if (!session || !session.queue || session.queue.length === 0) {
                console.log(`[Preloader] ⏹️ No songs in queue to preload for guild ${guildId}`);
                return;
            }
            
            // Get the first song in queue (next to be played)
            const nextSong = session.queue[0];
            console.log(`[Preloader] 🎵 Preloading next song: "${nextSong.title}"`);
            
            // Start preloading the next song
            await this.startPreloadForSong(nextSong, guildId);
            
        } catch (error) {
            console.error(`[Preloader] ❌ Error preloading next song:`, error.message);
        }
    }

    /**
     * Preload multiple songs in queue for a guild
     */
    async preloadMultipleSongsInQueue(guildId, count = 1) {
        console.log(`[Preloader] 🔄 Preloading ${count} songs in queue for guild ${guildId}`);
        
        try {
            const { getExistingSession } = await import('../core/audio-state.js');
            const session = getExistingSession(guildId);
            
            if (!session || !session.queue || session.queue.length === 0) {
                console.log(`[Preloader] ⏹️ No songs in queue to preload for guild ${guildId}`);
                return;
            }
            
            // Preload up to the specified count
            const songsToPreload = session.queue.slice(0, count);
            console.log(`[Preloader] 🎵 Preloading ${songsToPreload.length} songs: ${songsToPreload.map(s => s.title).join(', ')}`);
            
            // Start preloading each song
            for (const song of songsToPreload) {
                await this.startPreloadForSong(song, guildId);
            }
            
        } catch (error) {
            console.error(`[Preloader] ❌ Error preloading multiple songs:`, error.message);
        }
    }
}

export const preloader = new Preloader();
