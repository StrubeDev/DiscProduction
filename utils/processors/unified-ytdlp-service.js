import { spawn } from 'child_process';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { createReadStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import { PassThrough } from 'stream';
import { processManager } from '../services/process-manager.js';
import { processAudioWithFFmpeg } from './ffmpeg-processor.js';
import { checkDurationLimit } from '../functions/index.js';
import { fileNamingService } from '../services/file-naming-service.js';

class UnifiedYtdlpService {
    constructor() {
        console.log('[UnifiedYtdlp] Service loaded successfully');
        // Track active processes by query to prevent duplicates
        this.activeQueries = new Map(); // query -> { process, promise, timestamp }
        // Track recently completed queries to prevent rapid re-registration
        this.recentlyCompletedQueries = new Map(); // query -> timestamp
        this.ensureTempDirectory();
    }

    /**
     * Ensure temp directory exists
     */
    ensureTempDirectory() {
        if (!existsSync('temp')) {
            try {
                mkdirSync('temp', { recursive: true });
                console.log('[UnifiedYtdlp] Created temp directory');
            } catch (error) {
                console.error('[UnifiedYtdlp] Failed to create temp directory:', error.message);
            }
        }
    }

    /**
     * Add ytdlp process to per-guild tracking for cleanup
     */
    addProcessToTracking(ytdlpProcess, guildId) {
        processManager.addProcess(ytdlpProcess, guildId, 'ytdlp');
    }

    /**
     * Get current process status for monitoring
     */
    getProcessStatus() {
        return processManager.getDebugInfo();
    }


    /**
     * Remove ytdlp process from per-guild tracking when completed
     */
    removeProcessFromTracking(ytdlpProcess, guildId) {
        processManager.removeProcess(ytdlpProcess, guildId);
    }

    /**
     * Force cleanup all tracked processes (emergency memory fix)
     */
    async forceCleanupAllProcesses() {
        console.log(`[UnifiedYtdlp] 🚨 FORCE CLEANUP: Killing all tracked processes via process manager`);
        await processManager.killAllProcesses();
    }

    /**
     * Check if a query is already being processed or recently completed
     */
    isQueryActive(query, mode = 'audio') {
        const normalizedQuery = query.toLowerCase().trim();
        const queryKey = `${normalizedQuery}:${mode}`;
        
        // Check if currently active
        if (this.activeQueries.has(queryKey)) {
            return true;
        }
        
        // Check if recently completed (within last 2 seconds)
        const recentCompletion = this.recentlyCompletedQueries.get(queryKey);
        if (recentCompletion && (Date.now() - recentCompletion) < 2000) {
            console.log(`[UnifiedYtdlp] Query "${normalizedQuery}" (mode: ${mode}) was recently completed, blocking duplicate`);
            return true;
        }
        
        return false;
    }

    /**
     * Normalize query string to prevent case-sensitive duplicates
     */
    normalizeQuery(query) {
        return query.toLowerCase().trim();
    }

    /**
     * Get existing process for a query
     */
    getActiveProcess(query, mode = 'audio') {
        const normalizedQuery = query.toLowerCase().trim();
        const queryKey = `${normalizedQuery}:${mode}`;
        return this.activeQueries.get(queryKey);
    }

    /**
     * Register a query as being processed
     */
    registerActiveQuery(query, process, promise, mode = 'audio') {
        const normalizedQuery = query.toLowerCase().trim();
        const queryKey = `${normalizedQuery}:${mode}`;
        this.activeQueries.set(queryKey, {
            process,
            promise,
            timestamp: Date.now()
        });
        console.log(`[UnifiedYtdlp] Registered active query: "${normalizedQuery}" (mode: ${mode})`);
    }

    /**
     * Unregister a query when processing completes
     */
    unregisterActiveQuery(query, mode = 'audio') {
        const normalizedQuery = query.toLowerCase().trim();
        const queryKey = `${normalizedQuery}:${mode}`;
        if (this.activeQueries.has(queryKey)) {
            this.activeQueries.delete(queryKey);
            console.log(`[UnifiedYtdlp] Unregistered active query: "${normalizedQuery}" (mode: ${mode})`);
            
            // Add a small cooldown to prevent rapid re-registration of the same query
            this.recentlyCompletedQueries.set(queryKey, Date.now());
        }
    }

    /**
     * Clean up stale queries - AGGRESSIVE VERSION
     */
    cleanupStaleQueries() {
        const now = Date.now();
        const staleThreshold = 30 * 1000; // 30 seconds - MUCH more aggressive
        
        let cleanedCount = 0;
        
        for (const [queryKey, data] of this.activeQueries) {
            if (now - data.timestamp > staleThreshold) {
                console.log(`[UnifiedYtdlp] AGGRESSIVE: Cleaning up stale query: "${queryKey}"`);
                if (data.process && !data.process.killed) {
                    data.process.kill('SIGKILL'); // More aggressive
                }
                this.activeQueries.delete(queryKey);
                cleanedCount++;
            }
        }
        
        // ULTRA AGGRESSIVE: Clean up old recently completed queries (older than 2 seconds)
        for (const [queryKey, timestamp] of this.recentlyCompletedQueries) {
            if (now - timestamp > 2000) {
                this.recentlyCompletedQueries.delete(queryKey);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[UnifiedYtdlp] 🧹 AGGRESSIVE CLEANUP: Cleaned up ${cleanedCount} stale entries`);
        }
    }

    /**
     * Clean up dead processes from tracking
     */
    cleanupDeadProcesses() {
        // Process cleanup is now handled by the unified process manager
        console.log(`[UnifiedYtdlp] Process cleanup handled by unified process manager`);
    }

    /**
     * Comprehensive cleanup for a specific guild - removes all data
     */
    cleanupGuildData(guildId) {
        console.log(`[UnifiedYtdlp] 🧹 COMPREHENSIVE CLEANUP: Removing all data for guild ${guildId}`);
        
        let cleanedCount = 0;
        
        // Clean up active queries for this guild
        // Note: We can't easily identify guild-specific queries since guildId isn't stored in the data
        // So we'll clean up old queries regardless - MORE AGGRESSIVE CLEANUP
        const now = Date.now();
        for (const [queryKey, data] of this.activeQueries) {
            if (now - data.timestamp > 10 * 1000) { // 10 seconds - more aggressive
                this.activeQueries.delete(queryKey);
                cleanedCount++;
            }
        }
        
        // Clean up recently completed queries (we can't easily identify guild-specific ones)
        // So we'll clean up old ones regardless - MORE AGGRESSIVE CLEANUP
        for (const [queryKey, timestamp] of this.recentlyCompletedQueries) {
            if (now - timestamp > 5 * 1000) { // 5 seconds (much more aggressive)
                this.recentlyCompletedQueries.delete(queryKey);
                cleanedCount++;
            }
        }
        
        console.log(`[UnifiedYtdlp] ✅ COMPREHENSIVE CLEANUP COMPLETE for guild ${guildId} (${cleanedCount} entries cleaned)`);
    }

    /**
     * Clean up all data - emergency cleanup
     */
    cleanupAllData() {
        console.log(`[UnifiedYtdlp] 🧹 EMERGENCY CLEANUP: Removing all data`);
        
        const activeCount = this.activeQueries.size;
        const completedCount = this.recentlyCompletedQueries.size;
        
        this.activeQueries.clear();
        this.recentlyCompletedQueries.clear();
        
        console.log(`[UnifiedYtdlp] ✅ EMERGENCY CLEANUP COMPLETE (${activeCount} active, ${completedCount} completed entries cleaned)`);
    }
    
    /**
     * Aggressive cleanup after each song - clear ALL recently completed queries
     */
    aggressiveSongCleanup() {
        console.log(`[UnifiedYtdlp] 🧹 AGGRESSIVE SONG CLEANUP: Clearing all recently completed queries`);
        
        const clearedCount = this.recentlyCompletedQueries.size;
        this.recentlyCompletedQueries.clear();
        
        console.log(`[UnifiedYtdlp] ✅ AGGRESSIVE SONG CLEANUP COMPLETE: Cleared ${clearedCount} recently completed queries`);
    }

    /**
     * Main unified yt-dlp call that handles all modes
     */
    async unifiedYtdlpCall(input, mode = 'audio', options = {}, guildId = null) {
        console.log(`[UnifiedYtdlp] Unified call for mode: ${mode}, input: ${input}`);
        
        // ULTRA AGGRESSIVE: Clean up stale queries first
        this.cleanupStaleQueries();
        
        // EMERGENCY: If we have too many queries, force cleanup
        if (this.activeQueries.size > 10 || this.recentlyCompletedQueries.size > 50) {
            console.log(`[UnifiedYtdlp] 🚨 EMERGENCY CLEANUP: Too many queries (active: ${this.activeQueries.size}, completed: ${this.recentlyCompletedQueries.size})`);
            this.cleanupAllData();
        }
        
        // CRITICAL FIX: Normalize query BEFORE checking if active to prevent case-sensitive duplicates
        const normalizedInput = this.normalizeQuery(input);
        
        // Check if this query is already being processed
        if (this.isQueryActive(normalizedInput, mode)) {
            console.log(`[UnifiedYtdlp] Query "${normalizedInput}" (mode: ${mode}) is already being processed, waiting for existing process...`);
            const existingProcess = this.getActiveProcess(normalizedInput, mode);
            if (existingProcess && existingProcess.promise) {
                try {
                    return await existingProcess.promise;
                } catch (error) {
                    console.log(`[UnifiedYtdlp] Existing process failed, starting new one: ${error.message}`);
                    // Continue with new process below
                }
            } else if (existingProcess && !existingProcess.promise) {
                // Process exists but no promise - this means it's a recently completed query
                // Clear it from recently completed and proceed with new process
                console.log(`[UnifiedYtdlp] Query was recently completed but no active process, proceeding with new download`);
                const queryKey = `${normalizedInput}:${mode}`;
                this.recentlyCompletedQueries.delete(queryKey);
            }
        }
        
        const ytdlpArgs = [
            '--cookies', 'cookies.txt',
            '--no-playlist',
            '--no-warnings',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '--referer', 'https://www.youtube.com/',
            '--socket-timeout', '30', // 30 second socket timeout
            '--retries', '3', // Retry up to 3 times
            '--fragment-retries', '3', // Retry fragments up to 3 times
            '--retry-sleep', '1' // Wait 1 second between retries
        ];

        // Add mode-specific arguments
        switch (mode) {
            case 'search':
                // For search queries like "song name artist" - get video ID only
                ytdlpArgs.push('--default-search', 'ytsearch', '--get-id');
                break;
                
            case 'audio':
            case 'preload':
                // For audio streaming/download - extract opus audio
                ytdlpArgs.push('--extract-audio', '--audio-format', 'opus', '--audio-quality', '0');
                break;
                
            case 'metadata':
                // For getting video info
                ytdlpArgs.push('--dump-json', '--skip-download');
                break;
        }

        // Add output options
        if (mode === 'audio' || mode === 'preload') {
            if (options.tempFile) {
                ytdlpArgs.push('--output', options.tempFile);
            } else {
                ytdlpArgs.push('-o', '-'); // Output to stdout
            }
        }

        // Add input
        ytdlpArgs.push(input);
        
        console.log(`[UnifiedYtdlp] yt-dlp args: ${ytdlpArgs.join(' ')}`);
        
        // Use yt-dlp directly in Linux Docker, yt-dlp.exe in Windows
        let ytdlpCmd;
        if (process.platform === 'win32') {
            ytdlpCmd = 'yt-dlp.exe';
        } else if (process.env.DOCKER_ENV) {
            // In Docker, use absolute path to ensure we find the binary
            const possiblePaths = [
                '/usr/bin/yt-dlp',
                '/usr/local/bin/yt-dlp',
                'yt-dlp'
            ];
            ytdlpCmd = possiblePaths[0]; // Start with the most likely path
        } else {
            ytdlpCmd = 'yt-dlp';
        }
        
        const ytdlpProcess = spawn(ytdlpCmd, ytdlpArgs);
        
        // Add to per-guild process tracking for cleanup
        this.addProcessToTracking(ytdlpProcess, guildId);
        
        let stdout = '';
        let stderr = '';
        
        ytdlpProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            // Log progress for audio downloads
            if (mode === 'audio') {
                const output = data.toString();
                if (output.includes('[download]') || output.includes('%')) {
                    console.log(`[UnifiedYtdlp] 📥 Download progress: ${output.trim()}`);
                }
            }
        });
        
        ytdlpProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            // Log stderr for debugging
            const output = data.toString();
            if (output.trim()) {
                console.log(`[UnifiedYtdlp] 📝 yt-dlp stderr: ${output.trim()}`);
            }
        });
        
        // Create a promise for this process
        const processPromise = new Promise((resolve, reject) => {
            let timeoutId = null;
            let isResolved = false;
            
            // Set timeout for audio downloads (5 minutes) and search operations (2 minutes)
            const timeoutDuration = mode === 'audio' ? 5 * 60 * 1000 : (mode === 'search' ? 2 * 60 * 1000 : 30 * 1000); // 5 min for audio, 2 min for search, 30 sec for others
            timeoutId = setTimeout(() => {
                if (!isResolved) {
                    console.log(`[UnifiedYtdlp] ⏰ Process timeout after ${timeoutDuration/1000}s, killing PID ${ytdlpProcess.pid}`);
                    isResolved = true;
                    
                    // Kill the process
                    try {
                        ytdlpProcess.kill('SIGKILL');
                    } catch (killError) {
                        console.log(`[UnifiedYtdlp] Error killing process: ${killError.message}`);
                    }
                    
                    // Clean up
                    this.removeProcessFromTracking(ytdlpProcess, guildId);
                    this.unregisterActiveQuery(normalizedInput, mode);
                    
                    reject(new Error(`yt-dlp process timeout after ${timeoutDuration/1000} seconds`));
                }
            }, timeoutDuration);
            
            ytdlpProcess.on('exit', (code, signal) => {
                if (isResolved) return;
                isResolved = true;
                
                // Clear timeout
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                // Memory monitoring removed to prevent memory overhead
                
                // FIXED: Don't kill processes that have already exited normally
                // In file-based approach, FFmpeg should exit naturally after processing
                console.log(`[UnifiedYtdlp] Process completed naturally with code ${code}, signal ${signal}`);
                
                // Remove process from tracking when it completes
                this.removeProcessFromTracking(ytdlpProcess, guildId);
                
                // Unregister this query to allow future downloads
                this.unregisterActiveQuery(normalizedInput, mode);
                
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim(), process: ytdlpProcess });
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });
            
            ytdlpProcess.on('error', (error) => {
                if (isResolved) return;
                isResolved = true;
                
                // Clear timeout
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                // CRITICAL: Remove process from tracking when it errors
                this.removeProcessFromTracking(ytdlpProcess, guildId);
                // Unregister this query to allow future downloads
                this.unregisterActiveQuery(normalizedInput, mode);
                reject(new Error(`yt-dlp process error: ${error.message}`));
            });
        });
        
        // Register this query as being processed to prevent duplicates
        this.registerActiveQuery(normalizedInput, ytdlpProcess, processPromise, mode);
        
        // Return the promise
        return processPromise;
    }

    /**
     * Get audio stream - now uses unified service with preload support
     */
    async getAudioStream(videoUrl, guildId, volume = 100, preloadedData = null) {
        console.log(`[UnifiedYtdlp] getAudioStream called with: ${videoUrl}`);
        
        // CHECK FOR PRELOADED DATA FIRST - Avoid duplicate processing
        if (preloadedData && preloadedData.preloadedTempFile && preloadedData.preloadCompleted) {
            console.log(`[UnifiedYtdlp] 🚀 USING PRELOADED FILE: ${preloadedData.preloadedTempFile}`);
            
            // CRITICAL: Still check duration limits even for preloaded data
            if (guildId && preloadedData.preloadedMetadata?.duration > 0) {
                try {
                    const { getGuildSettings } = await import('../database/guildSettings.js');
                    const { checkDurationLimit } = await import('../functions/duration-limits.js');
                    const settings = await getGuildSettings(guildId);
                    const maxDuration = settings.max_duration_seconds || 0;
                    
                    const durationCheck = checkDurationLimit(preloadedData.preloadedMetadata.duration, maxDuration);
                    if (!durationCheck.isAllowed) {
                        const error = new Error(`Duration limit exceeded: ${durationCheck.durationFormatted} exceeds ${durationCheck.maxDurationFormatted}`);
                        error.code = 'DURATION_LIMIT_EXCEEDED';
                        error.durationInfo = durationCheck;
                        throw error;
                    }
                    
                    console.log(`[UnifiedYtdlp] ✅ Preloaded data duration check passed: ${durationCheck.durationFormatted} (limit: ${durationCheck.maxDurationFormatted})`);
                } catch (settingsError) {
                    console.warn(`[UnifiedYtdlp] Could not check duration limit for preloaded data: ${settingsError.message}`);
                    // Continue without duration check if settings can't be retrieved
                }
            }
            
            return await this.getAudioStreamFromTempFile(
                preloadedData.preloadedTempFile, 
                guildId, 
                volume, 
                preloadedData.preloadedMetadata
            );
        }
        
        try {
            // CRITICAL FIX: For search queries, first get the video ID to ensure consistency
            let actualVideoUrl = videoUrl;
            if (videoUrl.startsWith('ytsearch1:')) {
                console.log(`[UnifiedYtdlp] Search query detected, getting consistent video ID first`);
                actualVideoUrl = await this.searchSong(videoUrl, guildId);
                console.log(`[UnifiedYtdlp] Resolved search query to: ${actualVideoUrl}`);
            }
            
            // First get video info using the resolved URL (this includes duration limit checking)
            const videoInfo = await this.getVideoInfo(actualVideoUrl, guildId);
            console.log(`[UnifiedYtdlp] Getting stream for video: "${videoInfo.title}" at ${actualVideoUrl}`);
            
            // Additional duration check before processing audio
            if (guildId && videoInfo.duration > 0) {
                try {
                    const { getGuildSettings } = await import('../database/guildSettings.js');
                    const { checkDurationLimit } = await import('../functions/duration-limits.js');
                    const settings = await getGuildSettings(guildId);
                    const maxDuration = settings.max_duration_seconds || 0;
                    
                    const durationCheck = checkDurationLimit(videoInfo.duration, maxDuration);
                    if (!durationCheck.isAllowed) {
                        const error = new Error(`Duration limit exceeded: ${durationCheck.durationFormatted} exceeds ${durationCheck.maxDurationFormatted}`);
                        error.code = 'DURATION_LIMIT_EXCEEDED';
                        error.durationInfo = durationCheck;
                        throw error;
                    }
                    
                    console.log(`[UnifiedYtdlp] ✅ Duration check passed before processing: ${durationCheck.durationFormatted} (limit: ${durationCheck.maxDurationFormatted})`);
                } catch (settingsError) {
                    console.warn(`[UnifiedYtdlp] Could not check duration limit before processing: ${settingsError.message}`);
                    // Continue without duration check if settings can't be retrieved
                }
            }
            
            // Then process audio - pass preloaded temp file if available
            const existingTempFile = preloadedData?.preloadedTempFile || null;
            const ffmpegResult = await this.processAudioWithBuffer(actualVideoUrl, guildId, volume, existingTempFile, videoInfo);
            
            console.log(`[UnifiedYtdlp] Successfully created AudioResource for "${videoInfo.title}"`);
            
            return {
                audioResource: ffmpegResult.audioResource,
                metadata: {
                    title: videoInfo.title || 'Unknown Title',
                    duration: videoInfo.duration || 0,
                    uploader: videoInfo.uploader || 'Unknown',
                    thumbnail: videoInfo.thumbnail || null,  // Keep as 'thumbnail' for consistency
                    thumbnailUrl: videoInfo.thumbnailUrl || null,  // Use the thumbnailUrl property
                    url: videoUrl,
                    source: 'yt-dlp Download + FFmpeg Streaming'
                },
                process: ffmpegResult.process,
                ytDlpProcess: ffmpegResult.ytDlpProcess,
                ffmpegProcess: ffmpegResult.ffmpegProcess,
                tempFile: ffmpegResult.tempFile
            };
            
        } catch (error) {
            console.error(`[UnifiedYtdlp] Critical error in getAudioStream for "${videoUrl}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Download audio file only (for preloading) - no streaming
     * Returns the SAME temp file that will be used for streaming
     */
    async downloadAudioOnly(videoUrl, guildId) {
        console.log(`[UnifiedYtdlp] downloadAudioOnly called with: ${videoUrl}`);
        
        try {
            // CRITICAL FIX: For search queries, first get the video ID to ensure consistency
            let actualVideoUrl = videoUrl;
            if (videoUrl.startsWith('ytsearch1:')) {
                console.log(`[UnifiedYtdlp] Search query detected, getting consistent video ID first`);
                actualVideoUrl = await this.searchSong(videoUrl, guildId);
                console.log(`[UnifiedYtdlp] Resolved search query to: ${actualVideoUrl}`);
            }
            
            // First get video info using the resolved URL
            const videoInfo = await this.getVideoInfo(actualVideoUrl, guildId);
            console.log(`[UnifiedYtdlp] Getting video info for: "${videoInfo.title}" at ${actualVideoUrl}`);
            console.log(`[UnifiedYtdlp] Video duration: ${videoInfo.duration}s (${Math.floor(videoInfo.duration / 60)}m ${videoInfo.duration % 60}s)`);
            
            if (!videoInfo) {
                throw new Error('Failed to get video info');
            }
            
            // Download audio file only (no FFmpeg streaming)
            // Use centralized naming service for consistency
            const tempFile = fileNamingService.generateTempFileName('preload', videoUrl);
            console.log(`[UnifiedYtdlp] Downloading audio to temp file: ${tempFile}`);
            
            // Use the resolved URL for audio download to ensure consistency
            console.log(`[UnifiedYtdlp] Downloading audio from resolved URL: ${actualVideoUrl}`);
            await this.unifiedYtdlpCall(actualVideoUrl, 'audio', { tempFile }, guildId);
            
            console.log(`[UnifiedYtdlp] ✅ Audio download completed: ${tempFile}`);
            
            return {
                tempFile: tempFile, // This will be the SAME file used for streaming
                metadata: {
                    title: videoInfo.title || 'Unknown Title',
                    duration: videoInfo.duration || 0,
                    uploader: videoInfo.uploader || 'Unknown',
                    thumbnail: videoInfo.thumbnail || null,  // Keep as 'thumbnail' for consistency
                    thumbnailUrl: videoInfo.thumbnailUrl || null,  // Use the thumbnailUrl property
                    url: actualVideoUrl, // Use the resolved URL
                    source: 'yt-dlp Download Only (Preload)'
                }
            };
            
        } catch (error) {
            console.error(`[UnifiedYtdlp] Critical error in downloadAudioOnly for "${videoUrl}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Get video info - now uses unified service with duration limit checking
     */
    async getVideoInfo(videoUrl, guildId = null) {
        try {
            const result = await this.unifiedYtdlpCall(videoUrl, 'metadata', {}, guildId);
            const info = JSON.parse(result.stdout);
            
            const videoInfo = {
                title: info.title || 'Unknown Title',
                duration: info.duration || 0,
                uploader: info.uploader || 'Unknown',
                thumbnail: info.thumbnail || null,  // Keep as 'thumbnail' for consistency
                thumbnailUrl: info.thumbnail || null  // Also provide as 'thumbnailUrl' for compatibility
            };
            
            // Check duration limit if guildId is provided
            if (guildId && videoInfo.duration > 0) {
                try {
                    const { getGuildSettings } = await import('../database/guildSettings.js');
                    const settings = await getGuildSettings(guildId);
                    const maxDuration = settings.max_duration_seconds || 0;
                    
                    const durationCheck = checkDurationLimit(videoInfo.duration, maxDuration);
                    if (!durationCheck.isAllowed) {
                        const error = new Error(`Duration limit exceeded: ${durationCheck.durationFormatted} exceeds ${durationCheck.maxDurationFormatted}`);
                        error.code = 'DURATION_LIMIT_EXCEEDED';
                        error.durationInfo = durationCheck;
                        throw error;
                    }
                    
                    console.log(`[UnifiedYtdlp] ✅ Duration check passed: ${durationCheck.durationFormatted} (limit: ${durationCheck.maxDurationFormatted})`);
                } catch (settingsError) {
                    console.warn(`[UnifiedYtdlp] Could not check duration limit: ${settingsError.message}`);
                    // Continue without duration check if settings can't be retrieved
                }
            }
            
            return videoInfo;
        } catch (error) {
            console.error(`[UnifiedYtdlp] Error getting video info: ${error.message}`);
            throw error;
        }
    }

    /**
     * Set up Promise resolution based on process completion
     */
    setupProcessPromise(ffmpegProcess, resolve, reject) {
        let resolved = false;
        
        // Handle process exit directly
        ffmpegProcess.on('exit', (code, signal) => {
            if (resolved) return;
            resolved = true;
            
            // Check if process had an error
            if (ffmpegProcess._lastError) {
                reject(ffmpegProcess._lastError);
                return;
            }
            
            // Check exit code
            if (code !== 0 && code !== 1) {
                reject(new Error(`FFmpeg process failed with code ${code}`));
                return;
            }
            
            // Process completed successfully
            resolve();
        });
        
        // Handle process errors
        ffmpegProcess.on('error', (error) => {
            console.error(`[UnifiedYtdlp] FFmpeg process error:`, error);
            console.error(`[UnifiedYtdlp] FFmpeg command that failed: ${ffmpegCmd} ${ffmpegArgs.join(' ')}`);
            if (resolved) return;
            resolved = true;
            reject(error);
        });
    }


    /**
     * Process audio with buffer - now uses unified service with preload support
     */
    async processAudioWithBuffer(input, guildId, volume = 100, existingTempFile = null, videoInfo = null) {
        console.log(`[UnifiedYtdlp] Processing audio using buffer approach for guild ${guildId}`);
        
        try {
            let tempFile = null;
            
            // USE EXISTING TEMP FILE IF AVAILABLE - Avoid duplicate download
            if (existingTempFile && existsSync(existingTempFile)) {
                console.log(`[UnifiedYtdlp] 🚀 REUSING PRELOADED TEMP FILE: ${existingTempFile}`);
                tempFile = existingTempFile;
                return await processAudioWithFFmpeg(tempFile, guildId, volume, false, videoInfo);
            } else {
                tempFile = fileNamingService.generateTempFileName('audio', input);
                console.log(`[UnifiedYtdlp] Downloading audio to temp file: ${tempFile}`);
                
                // Use unified service for audio download
                await this.unifiedYtdlpCall(input, 'audio', { tempFile }, guildId);
                
                console.log(`[UnifiedYtdlp] ✅ Audio download completed, starting FFmpeg processing from temp file: ${tempFile}`);
                const result = await processAudioWithFFmpeg(tempFile, guildId, volume, false, videoInfo);
                console.log(`[UnifiedYtdlp] ✅ FFmpeg processing completed successfully`);
                return result;
            }
        } catch (error) {
            console.error(`[UnifiedYtdlp] Error in processAudioWithBuffer:`, error);
            throw error;
        }
    }

    /**
     * Search for a song and get YouTube video ID
     */
    async searchSong(searchQuery, guildId = null) {
        console.log(`[UnifiedYtdlp] Searching for: "${searchQuery}"`);
        
        try {
            // Search without duration filter to get the most relevant results
            const result = await this.unifiedYtdlpCall(searchQuery, 'search', {}, guildId);
            const videoId = result.stdout.trim();
            
            if (videoId) {
                const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`[UnifiedYtdlp] Search successful: "${searchQuery}" -> ${youtubeUrl}`);
                return youtubeUrl;
            } else {
                throw new Error('No video ID returned from search');
            }
        } catch (error) {
            console.error(`[UnifiedYtdlp] Search failed for "${searchQuery}": ${error.message}`);
            throw error;
        }
    }

    extractVideoId(url) {
        if (!url) return null;
        const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async handleSearchError(error, query, guildId) {
        console.error(`[UnifiedYtdlp] Search error for "${query}" in guild ${guildId}: ${error.message}`);
        return null;
    }

    // Preload the next song in queue to temp file with metadata extraction
    async preloadSongToTempFile(videoUrl, guildId) {
        console.log(`[UnifiedYtdlp] Preloading song to temp file: ${videoUrl}`);
        
        try {
            const tempFile = fileNamingService.generateTempFileName('preload', videoUrl);
            console.log(`[UnifiedYtdlp] Preloading to temp file: ${tempFile}`);
            
            // First, extract metadata using unified service
            console.log(`[UnifiedYtdlp] Extracting metadata for: ${videoUrl}`);
            const metadataResult = await this.unifiedYtdlpCall(videoUrl, 'metadata', {}, guildId);
            
            // Parse metadata
            let metadata = {};
            try {
                metadata = JSON.parse(metadataResult.stdout);
                console.log(`[UnifiedYtdlp] Extracted metadata: title="${metadata.title}", duration=${metadata.duration}, thumbnail="${metadata.thumbnail}"`);
            } catch (parseError) {
                console.error(`[UnifiedYtdlp] Failed to parse metadata JSON:`, parseError.message);
                metadata = { title: 'Unknown', duration: 0, thumbnail: null };
            }
            
            // Now download the audio file using unified service
            console.log(`[UnifiedYtdlp] Downloading audio to: ${tempFile}`);
            await this.unifiedYtdlpCall(videoUrl, 'preload', { tempFile }, guildId);
            
            console.log(`[UnifiedYtdlp] Preload completed successfully for: ${metadata.title}`);
            
            return {
                tempFile: tempFile, // Return the temp file path for later use
                metadata: {
                    title: metadata.title || 'Unknown Title',
                    duration: metadata.duration || 0,
                    thumbnail: metadata.thumbnail || null,  // Keep as 'thumbnail' for consistency
                    thumbnailUrl: metadata.thumbnail || null,  // Also provide as 'thumbnailUrl' for compatibility
                    url: videoUrl
                }
            };
            
        } catch (error) {
            console.error(`[UnifiedYtdlp] Preload failed for ${videoUrl}: ${error.message}`);
            throw error;
        }
    }

    // Get audio stream from preloaded temp file (fast path)
    async getAudioStreamFromTempFile(tempFile, guildId, volume = 100, originalMetadata = null) {
        console.log(`[UnifiedYtdlp] Getting audio stream from preloaded temp file: ${tempFile}`);
        
        // Check if temp file exists
        if (!existsSync(tempFile)) {
            console.error(`[UnifiedYtdlp] Fast path temp file does not exist: ${tempFile}`);
            throw new Error(`Preloaded temp file not found: ${tempFile}`);
        }
        
        // Use the unified FFmpeg processing function
        // UNIFIED: Use the same naming pattern for all processed files
        return await processAudioWithFFmpeg(tempFile, guildId, volume, false, originalMetadata);
    }

    /**
     * Get playlist info (title only)
     */
    async getPlaylistInfo(playlistUrl) {
        console.log(`[UnifiedYtdlp] Getting playlist info for: ${playlistUrl}`);
        
        // Use a custom ytdlp call for playlist info
        const ytdlpArgs = [
            '--no-warnings',
            '--print', '%(playlist_title)s',
            '--ignore-errors',
            '--playlist-items', '1', // Just get first item to get playlist info
            playlistUrl
        ];
        
        return new Promise((resolve, reject) => {
            // Use yt-dlp directly in Linux Docker, yt-dlp.exe in Windows
            let ytdlpCmd;
            if (process.platform === 'win32') {
                ytdlpCmd = 'yt-dlp.exe';
            } else if (process.env.DOCKER_ENV) {
                // In Docker, use absolute path to ensure we find the binary
                const possiblePaths = [
                    '/usr/bin/yt-dlp',
                    '/usr/local/bin/yt-dlp',
                    'yt-dlp'
                ];
                ytdlpCmd = possiblePaths[0]; // Start with the most likely path
            } else {
                ytdlpCmd = 'yt-dlp';
            }
            
            const ytdlpProcess = spawn(ytdlpCmd, ytdlpArgs);
            
            let stdout = '';
            let stderr = '';
            
            ytdlpProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            ytdlpProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ytdlpProcess.on('exit', (code, signal) => {
                console.log(`[UnifiedYtdlp] Process completed naturally with code ${code}, signal ${signal}`);
                
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });
            
            ytdlpProcess.on('error', (error) => {
                reject(new Error(`yt-dlp process error: ${error.message}`));
            });
        });
    }

    /**
     * Get playlist tracks
     */
    async getPlaylistTracks(playlistUrl) {
        console.log(`[UnifiedYtdlp] Getting playlist tracks for: ${playlistUrl}`);
        
        const ytdlpArgs = [
            '--flat-playlist',
            '--no-warnings',
            '--print', '%(title)s|||%(url)s',
            '--ignore-errors',
            playlistUrl
        ];
        
        return new Promise((resolve, reject) => {
            // Use yt-dlp directly in Linux Docker, yt-dlp.exe in Windows
            let ytdlpCmd;
            if (process.platform === 'win32') {
                ytdlpCmd = 'yt-dlp.exe';
            } else if (process.env.DOCKER_ENV) {
                // In Docker, use absolute path to ensure we find the binary
                const possiblePaths = [
                    '/usr/bin/yt-dlp',
                    '/usr/local/bin/yt-dlp',
                    'yt-dlp'
                ];
                ytdlpCmd = possiblePaths[0]; // Start with the most likely path
            } else {
                ytdlpCmd = 'yt-dlp';
            }
            
            const ytdlpProcess = spawn(ytdlpCmd, ytdlpArgs);
            
            let stdout = '';
            let stderr = '';
            
            ytdlpProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            ytdlpProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ytdlpProcess.on('exit', (code, signal) => {
                console.log(`[UnifiedYtdlp] Process completed naturally with code ${code}, signal ${signal}`);
                
                if (code === 0) {
                    // Parse the output into track objects
                    const tracks = stdout.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            const [title, url] = line.split('|||');
                            return { title: title?.trim(), url: url?.trim() };
                        })
                        .filter(track => track.title && track.url);
                    
                    resolve(tracks);
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });
            
            ytdlpProcess.on('error', (error) => {
                reject(new Error(`yt-dlp process error: ${error.message}`));
            });
        });
    }
}

const unifiedYtdlpService = new UnifiedYtdlpService();
export { unifiedYtdlpService };
export default UnifiedYtdlpService;
