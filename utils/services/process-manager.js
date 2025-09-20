// utils/process-manager.js
// Unified process management system - single source of truth for all process tracking

import { spawn } from 'child_process';
import { fileDeletionService } from './file-deletion-service.js';

class ProcessManager {
    constructor() {
        // Track processes by guild ID
        this.guildProcesses = new Map(); // guildId -> Set of processes
        // Track processes by type for debugging
        this.processTypes = new Map(); // process -> { type: 'ffmpeg'|'ytdlp', guildId, startTime, memoryUsage }
        // Track memory usage per process
        this.processMemory = new Map(); // process -> { rss: number, heapUsed: number, lastUpdate: number }
    }

    /**
     * Add a process to tracking with proper lifecycle management
     */
    addProcess(process, guildId, type = 'unknown') {
        if (!process || process.killed) {
            console.warn(`[ProcessManager] Cannot add invalid or killed process for guild ${guildId}`);
            return;
        }

        if (!this.guildProcesses.has(guildId)) {
            this.guildProcesses.set(guildId, new Set());
        }
        
        this.guildProcesses.get(guildId).add(process);
        this.processTypes.set(process, { 
            type, 
            guildId, 
            startTime: Date.now(),
            memoryUsage: 0
        });
        
        // Initialize memory tracking
        this.processMemory.set(process, {
            rss: 0,
            heapUsed: 0,
            lastUpdate: Date.now()
        });
        
        console.log(`[ProcessManager] Added ${type} process PID ${process.pid} for guild ${guildId}`);
        
        // Set up proper lifecycle event handlers
        this.setupProcessLifecycle(process, guildId, type);
    }

    /**
     * Set up process lifecycle event handlers
     */
    setupProcessLifecycle(process, guildId, type) {
        // Handle process exit
        process.on('exit', (code, signal) => {
            console.log(`[ProcessManager] Process PID ${process.pid} (${type}) exited with code ${code}, signal ${signal}`);
            
            // FFmpeg-specific exit handling
            if (type === 'ffmpeg') {
                this.handleFFmpegExit(process, guildId, code, signal);
            }
            
            this.cleanupProcess(process, guildId, type);
        });
        
        // Handle process errors
        process.on('error', (error) => {
            console.error(`[ProcessManager] Process PID ${process.pid} (${type}) error:`, error.message);
            
            // FFmpeg-specific error handling
            if (type === 'ffmpeg') {
                this.handleFFmpegError(process, guildId, error);
            }
            
            this.cleanupProcess(process, guildId, type);
        });

        // Handle process close (for some process types)
        process.on('close', (code, signal) => {
            console.log(`[ProcessManager] Process PID ${process.pid} (${type}) closed with code ${code}, signal ${signal}`);
            
            // For FFmpeg processes, clean up immediately to free memory
            if (type === 'ffmpeg') {
                console.log(`[ProcessManager] FFmpeg PID ${process.pid} finished - cleaning up immediately to free memory`);
                // Mark process as finished and clean up immediately
                process._finished = true;
                process._exitCode = code;
                process._exitSignal = signal;
                this.cleanupProcess(process, guildId, type);
            } else {
                // For other process types, clean up immediately
                this.cleanupProcess(process, guildId, type);
            }
        });

        // Set up FFmpeg-specific handlers
        if (type === 'ffmpeg') {
            this.setupFFmpegHandlers(process, guildId);
        }
    }

    /**
     * Set up FFmpeg-specific event handlers
     */
    setupFFmpegHandlers(process, guildId) {
        // Enhanced stderr monitoring for FFmpeg
        process.stderr.on('data', (data) => {
            const errorMessage = data.toString();
            const trimmedError = errorMessage.trim();
            
            // Log all stderr output for debugging
            if (trimmedError) {
                console.log(`[ProcessManager] FFmpeg stderr: ${trimmedError}`);
            }
            
            // Handle specific error types
            if (errorMessage.includes('Connection reset by peer') || 
                errorMessage.includes('Connection refused') ||
                errorMessage.includes('Broken pipe')) {
                console.warn(`[ProcessManager] FFmpeg connection error detected: ${trimmedError}`);
                // Don't reject immediately - let the process handle it gracefully
            } else if (errorMessage.includes('No such file or directory') ||
                       errorMessage.includes('Permission denied') ||
                       errorMessage.includes('Invalid data found')) {
                console.error(`[ProcessManager] FFmpeg critical error: ${trimmedError}`);
                // These are more serious errors that might need immediate attention
            } else if (errorMessage.includes('error') || errorMessage.includes('Error')) {
                console.warn(`[ProcessManager] FFmpeg warning: ${trimmedError}`);
            }
        });
    }

    /**
     * Handle FFmpeg-specific exit logic
     */
    handleFFmpegExit(process, guildId, code, signal) {
        // Clean up FFmpeg-related resources
        try {
            // Clean up any remaining stdio streams
            if (process.stdout && !process.stdout.destroyed) {
                process.stdout.destroy();
            }
            if (process.stderr && !process.stderr.destroyed) {
                process.stderr.destroy();
            }
            if (process.stdin && !process.stdin.destroyed) {
                process.stdin.destroy();
            }
            
            // Remove all event listeners to prevent memory leaks
            process.removeAllListeners();
            
            // Clear any references stored on the process
            process._exitCode = code;
            process._exitSignal = signal;
            process._lastError = null;
            
            console.log(`[ProcessManager] Cleaned up FFmpeg PID ${process.pid} resources`);
        } catch (cleanupError) {
            console.warn(`[ProcessManager] Error during FFmpeg cleanup:`, cleanupError.message);
        }
    }

    /**
     * Handle FFmpeg-specific error logic
     */
    handleFFmpegError(process, guildId, error) {
        // Store error for potential handling
        process._lastError = error;
    }

    // Memory monitoring removed to prevent memory overhead

    /**
     * Clean up finished FFmpeg processes for a guild
     * This should be called when audio player goes idle
     */
    cleanupFinishedFFmpegProcesses(guildId) {
        const guildProcesses = this.guildProcesses.get(guildId);
        if (!guildProcesses) return;

        // Find all FFmpeg processes for this guild and kill them
        const ffmpegProcesses = Array.from(guildProcesses).filter(process => {
            const processInfo = this.processTypes.get(process);
            return processInfo && processInfo.type === 'ffmpeg' && !process.killed;
        });
        
        console.log(`[ProcessManager] Cleaning up ${ffmpegProcesses.length} FFmpeg processes for guild ${guildId}`);
        
        ffmpegProcesses.forEach(process => {
            console.log(`[ProcessManager] Killing FFmpeg process PID ${process.pid} for guild ${guildId}`);
            this.cleanupProcess(process, guildId, 'ffmpeg');
        });
    }

    /**
     * COMPREHENSIVE cleanup for everything after a song finishes
     * This is the single point of cleanup that handles ALL resources
     */
    async comprehensiveSongCleanup(guildId, audioResource = null) {
        console.log(`[ProcessManager] 🧹 COMPREHENSIVE SONG CLEANUP: Starting selective cleanup for guild ${guildId}`);
        
        try {
            // STEP 1: Only kill OLD processes, not new ones that might be processing the next song
            const guildProcesses = this.guildProcesses.get(guildId);
            if (guildProcesses && guildProcesses.size > 0) {
                console.log(`[ProcessManager] 🧹 SMART CLEANUP: Removing only old processes for guild ${guildId}`);
                
                // Only kill processes that are not actively processing new songs
                const processesToKill = [];
                const processesToKeep = [];
                
                for (const process of guildProcesses) {
                    if (process && !process.killed) {
                        const processInfo = this.processTypes.get(process);
                        const type = processInfo ? processInfo.type : 'unknown';
                        const age = processInfo ? (Date.now() - processInfo.startTime) : 0;
                        
                        // Keep processes that are less than 30 seconds old (likely processing next song)
                        if (age < 30000) {
                            processesToKeep.push({ process, type, age });
                            console.log(`[ProcessManager] 🛡️ PRESERVING ${type} process PID ${process.pid} (age: ${Math.round(age/1000)}s)`);
                        } else {
                            processesToKill.push({ process, type, age });
                            console.log(`[ProcessManager] 🗑️ KILLING ${type} process PID ${process.pid} (age: ${Math.round(age/1000)}s)`);
                        }
                    }
                }
                
                // Kill only old processes
                for (const { process, type } of processesToKill) {
                    try {
                        // For Docker: Use aggressive cleanup
                        if (process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production') {
                            // Kill process group to handle child processes
                            if (process.pid) {
                                try {
                                    process.kill(-process.pid); // Kill process group
                                } catch (e) { /* ignore if process group kill fails */ }
                            }
                            process.kill('SIGKILL');
                        } else {
                            // Standard cleanup
                            process.kill('SIGTERM');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            if (!process.killed) {
                                process.kill('SIGKILL');
                            }
                        }
                    } catch (killError) {
                        console.warn(`[ProcessManager] Error killing ${type} process PID ${process.pid}:`, killError.message);
                    }
                }
                
                console.log(`[ProcessManager] ✅ SMART CLEANUP COMPLETE for guild ${guildId}: killed ${processesToKill.length}, preserved ${processesToKeep.length}`);
            }
            
            // STEP 2: Clean up audio resource and its streams
            if (audioResource) {
                console.log(`[ProcessManager] Cleaning up audio resource for guild ${guildId}`);
                
                try {
                    // Kill attached FFmpeg process
                    if (audioResource._ffmpegProcess && !audioResource._ffmpegProcess.killed) {
                        console.log(`[ProcessManager] Killing attached FFmpeg process PID ${audioResource._ffmpegProcess.pid}`);
                        audioResource._ffmpegProcess.kill('SIGKILL');
                    }
                    
                    // Destroy file stream
                    if (audioResource._fileStream && audioResource._fileStream.destroy) {
                        audioResource._fileStream.destroy();
                    }
                    
                    // Destroy audio resource
                    if (audioResource.destroy) {
                        audioResource.destroy();
                    }
                } catch (resourceError) {
                    console.warn(`[ProcessManager] Error cleaning up audio resource:`, resourceError.message);
                }
            }
            
            // STEP 3: Clean up temp files using centralized service
            if (audioResource) {
                const result = fileDeletionService.deleteAudioResourceFiles(audioResource, 'process manager cleanup');
                console.log(`[ProcessManager] Audio resource file cleanup result:`, result);
            }
            
            // STEP 4: Smart cleanup - only kill old processes, preserve preload processes
            this.smartCleanupGuildData(guildId);
            
            // STEP 5: Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log(`[ProcessManager] 🗑️ Forced garbage collection`);
            }
            
            // STEP 6: Log detailed memory map after cleanup
            console.log(`[ProcessManager] 📊 DETAILED MEMORY MAP AFTER CLEANUP:`);
            this.logDetailedMemoryMap();
            
            console.log(`[ProcessManager] ✅ COMPREHENSIVE SONG CLEANUP COMPLETE for guild ${guildId}`);
            
        } catch (error) {
            console.error(`[ProcessManager] Error during comprehensive cleanup:`, error);
        }
    }

    /**
     * Clean up a process and its resources
     */
    cleanupProcess(process, guildId, type) {
        try {
            // Force kill the process if it's still running
            if (process && !process.killed) {
                console.log(`[ProcessManager] Force killing ${type} process PID ${process.pid} during cleanup`);
                try {
                    process.kill('SIGKILL');
                } catch (killError) {
                    console.warn(`[ProcessManager] Error force killing process:`, killError.message);
                }
            }

            // Remove all event listeners to prevent memory leaks
            if (process.removeAllListeners) {
                process.removeAllListeners();
            }

            // Clean up stdio streams
            if (process.stdout && !process.stdout.destroyed) {
                process.stdout.destroy();
            }
            if (process.stderr && !process.stderr.destroyed) {
                process.stderr.destroy();
            }
            if (process.stdin && !process.stdin.destroyed) {
                process.stdin.destroy();
            }

            // Remove from tracking
            this.removeProcess(process, guildId);
            
            console.log(`[ProcessManager] Cleaned up ${type} process PID ${process.pid} for guild ${guildId}`);
        } catch (error) {
            console.warn(`[ProcessManager] Error cleaning up ${type} process PID ${process.pid}:`, error.message);
        }
    }

    /**
     * Remove a process from tracking
     */
    removeProcess(process, guildId) {
        if (this.guildProcesses.has(guildId)) {
            this.guildProcesses.get(guildId).delete(process);
            
            // Clean up empty guild entries
            if (this.guildProcesses.get(guildId).size === 0) {
                this.guildProcesses.delete(guildId);
            }
        }
        
        this.processTypes.delete(process);
        this.processMemory.delete(process);
        console.log(`[ProcessManager] Removed process PID ${process.pid} from guild ${guildId}`);
    }

    /**
     * Kill all processes for a guild
     */
    async killGuildProcesses(guildId) {
        if (!this.guildProcesses.has(guildId)) {
            console.log(`[ProcessManager] No processes found for guild ${guildId}`);
            return;
        }

        const processes = Array.from(this.guildProcesses.get(guildId));
        console.log(`[ProcessManager] Killing ${processes.length} processes for guild ${guildId}`);

        for (const process of processes) {
            if (process && !process.killed) {
                const processInfo = this.processTypes.get(process);
                const type = processInfo ? processInfo.type : 'unknown';
                
                // Don't kill FFmpeg processes that are actively working
                if (type === 'ffmpeg' && this.isProcessActive(process)) {
                    console.log(`[ProcessManager] Skipping active FFmpeg process PID ${process.pid} - still processing`);
                    continue;
                }
                
                console.log(`[ProcessManager] Killing ${type} process PID ${process.pid}`);
                
                try {
                    // IMPROVED: For FFmpeg processes, try graceful shutdown first, then force kill if needed
                    if (type === 'ffmpeg') {
                        console.log(`[ProcessManager] Gracefully shutting down FFmpeg process PID ${process.pid}`);
                        process.kill('SIGTERM');
                        
                        // Wait for graceful shutdown (FFmpeg needs time to finish processing)
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Force kill only if still alive after graceful shutdown
                        if (!process.killed) {
                            console.log(`[ProcessManager] Force killing FFmpeg process PID ${process.pid} after graceful shutdown failed`);
                            process.kill('SIGKILL');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } else {
                        // Try graceful shutdown first for other processes
                        process.kill('SIGTERM');
                        
                        // Wait a bit for graceful shutdown
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Force kill if still alive
                        if (!process.killed) {
                            console.log(`[ProcessManager] Force killing ${type} process PID ${process.pid}`);
                            process.kill('SIGKILL');
                            
                            // Wait for force kill to take effect
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                    
                    if (process.killed) {
                        console.log(`[ProcessManager] Successfully killed ${type} process PID ${process.pid}`);
                    } else {
                        console.warn(`[ProcessManager] ${type} process PID ${process.pid} still alive after SIGKILL`);
                    }
                } catch (error) {
                    console.warn(`[ProcessManager] Error killing ${type} process PID ${process.pid}:`, error.message);
                }
            }
        }
        
        // Clean up process metadata for all processes
        for (const process of processes) {
            this.processTypes.delete(process);
            this.processMemory.delete(process);
        }
        
        // Clear all processes for this guild
        this.guildProcesses.delete(guildId);
        console.log(`[ProcessManager] ✅ Cleaned up all process data for guild ${guildId}`);
    }

    /**
     * Kill all processes across all guilds
     */
    async killAllProcesses() {
        console.log(`[ProcessManager] Killing all processes across ${this.guildProcesses.size} guilds`);
        
        for (const guildId of this.guildProcesses.keys()) {
            await this.killGuildProcesses(guildId);
        }
    }

    /**
     * Comprehensive cleanup for a specific guild - removes all data
     */
    cleanupGuildData(guildId) {
        console.log(`[ProcessManager] 🧹 COMPREHENSIVE CLEANUP: Removing all data for guild ${guildId}`);
        
        // Get all processes for this guild before cleanup
        const processes = this.guildProcesses.has(guildId) ? Array.from(this.guildProcesses.get(guildId)) : [];
        
        // Clean up process metadata
        for (const process of processes) {
            this.processTypes.delete(process);
            this.processMemory.delete(process);
        }
        
        // Remove guild from all Maps
        this.guildProcesses.delete(guildId);
        
        console.log(`[ProcessManager] ✅ COMPREHENSIVE CLEANUP COMPLETE for guild ${guildId}`);
    }
    
    /**
     * Smart cleanup - only kills old processes, preserves preload processes
     */
    smartCleanupGuildData(guildId) {
        console.log(`[ProcessManager] 🧹 SMART CLEANUP: Removing only old processes for guild ${guildId}`);
        
        const processes = this.guildProcesses.has(guildId) ? Array.from(this.guildProcesses.get(guildId)) : [];
        const now = Date.now();
        let killedCount = 0;
        let preservedCount = 0;
        
        for (const process of processes) {
            const processInfo = this.processTypes.get(process);
            if (processInfo) {
                const age = now - processInfo.startTime;
                
                if (processInfo.type === 'ytdlp' && age < 30000) {
                    // Preserve recent ytdlp processes (likely preload)
                    console.log(`[ProcessManager] Preserving recent ytdlp process PID ${process.pid} (${Math.round(age/1000)}s old) - likely preload`);
                    preservedCount++;
                } else {
                    // Kill old processes
                    console.log(`[ProcessManager] Killing ${processInfo.type} process PID ${process.pid} (${Math.round(age/1000)}s old)`);
                    this.killProcess(process, guildId, processInfo.type);
                    killedCount++;
                }
            }
        }
        
        console.log(`[ProcessManager] ✅ SMART CLEANUP COMPLETE for guild ${guildId}: killed ${killedCount}, preserved ${preservedCount}`);
    }

    /**
     * Clean up old process data to prevent memory leaks - ULTRA AGGRESSIVE VERSION
     */
    cleanupOldProcessData() {
        const now = Date.now();
        const maxAge = 30 * 1000; // 30 seconds - ULTRA aggressive for memory conservation
        
        let cleanedCount = 0;
        
        // Clean up old process types
        for (const [process, data] of this.processTypes) {
            if (now - data.startTime > maxAge) {
                this.processTypes.delete(process);
                this.processMemory.delete(process);
                cleanedCount++;
            }
        }
        
        // AGGRESSIVE: Also clean up killed processes immediately
        for (const [process, data] of this.processTypes) {
            if (process.killed || process._finished) {
                this.processTypes.delete(process);
                this.processMemory.delete(process);
                cleanedCount++;
            }
        }
        
        // AGGRESSIVE: Clean up processes that are too old or consuming too much memory
        for (const [process, data] of this.processTypes) {
            const memoryInfo = this.processMemory.get(process);
            const memoryMB = memoryInfo ? Math.round(memoryInfo.rss / 1024 / 1024) : 0;
            const age = now - data.startTime;
            
            // Kill processes that are old OR consuming too much memory
            if (age > maxAge || memoryMB > 50) {
                console.log(`[ProcessManager] 🚨 Killing ${data.type} process PID ${process.pid} (age: ${Math.round(age/1000)}s, memory: ${memoryMB}MB)`);
                this.processTypes.delete(process);
                this.processMemory.delete(process);
                cleanedCount++;
                
                // Actually kill the process if it's still running
                if (process && !process.killed) {
                    try {
                        process.kill('SIGKILL');
                    } catch (e) { /* ignore */ }
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[ProcessManager] 🧹 AGGRESSIVE CLEANUP: Cleaned up ${cleanedCount} old process entries`);
        }
    }

    /**
     * Get process count for a guild
     */
    getGuildProcessCount(guildId) {
        return this.guildProcesses.has(guildId) ? this.guildProcesses.get(guildId).size : 0;
    }

    /**
     * Get all processes for a guild
     */
    getGuildProcesses(guildId) {
        return this.guildProcesses.has(guildId) ? Array.from(this.guildProcesses.get(guildId)) : [];
    }

    /**
     * Check if a process is being tracked
     */
    isProcessTracked(process) {
        return this.processTypes.has(process);
    }

    /**
     * Update memory usage for a process
     */
    updateProcessMemory(process) {
        if (!this.processMemory.has(process)) return;
        
        try {
            // Get process memory usage (this is approximate for child processes)
            const memUsage = process.memoryUsage ? process.memoryUsage() : { rss: 0, heapUsed: 0 };
            this.processMemory.set(process, {
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                lastUpdate: Date.now()
            });
            
            // Update the process type info
            const processInfo = this.processTypes.get(process);
            if (processInfo) {
                processInfo.memoryUsage = Math.round(memUsage.rss / 1024 / 1024); // MB
            }
        } catch (error) {
            // Child processes might not have memoryUsage method
            console.warn(`[ProcessManager] Could not get memory usage for process ${process.pid}:`, error.message);
        }
    }
    
    /**
     * Get processes consuming excessive memory
     */
    getMemoryConsumingProcesses(thresholdMB = 50) {
        const memoryConsumers = [];
        
        for (const [process, memoryInfo] of this.processMemory) {
            const memMB = Math.round(memoryInfo.rss / 1024 / 1024);
            if (memMB > thresholdMB) {
                const processInfo = this.processTypes.get(process);
                memoryConsumers.push({
                    process,
                    pid: process.pid,
                    type: processInfo?.type || 'unknown',
                    guildId: processInfo?.guildId || 'unknown',
                    memoryMB: memMB,
                    startTime: processInfo?.startTime || 0,
                    age: Date.now() - (processInfo?.startTime || 0)
                });
            }
        }
        
        return memoryConsumers.sort((a, b) => b.memoryMB - a.memoryMB);
    }
    
    /**
     * Kill processes consuming excessive memory
     */
    async killMemoryConsumingProcesses(thresholdMB = 50) {
        const memoryConsumers = this.getMemoryConsumingProcesses(thresholdMB);
        
        if (memoryConsumers.length === 0) {
            console.log(`[ProcessManager] No processes consuming more than ${thresholdMB}MB`);
            return;
        }
        
        console.log(`[ProcessManager] Found ${memoryConsumers.length} processes consuming excessive memory:`);
        for (const proc of memoryConsumers) {
            console.log(`[ProcessManager] - ${proc.type} PID ${proc.pid} (Guild: ${proc.guildId}): ${proc.memoryMB}MB (Age: ${Math.round(proc.age / 1000)}s)`);
        }
        
        // Kill the most memory-consuming processes first
        for (const proc of memoryConsumers) {
            if (proc.process && !proc.process.killed) {
                console.log(`[ProcessManager] Killing memory-consuming ${proc.type} process PID ${proc.pid} (${proc.memoryMB}MB)`);
                await this.killProcess(proc.process, proc.guildId);
            }
        }
    }
    
    /**
     * Check if a process is actively working (not safe to kill)
     */
    isProcessActive(process) {
        if (!process || process.killed) return false;
        
        const processInfo = this.processTypes.get(process);
        if (!processInfo) return false;
        
        // Check if process was started recently (within last 10 seconds)
        const timeSinceStart = Date.now() - processInfo.startTime;
        return timeSinceStart < 10000; // 10 seconds
    }

    /**
     * Kill a specific process
     */
    async killProcess(process, guildId) {
        if (!process || process.killed) return;
        
        const processInfo = this.processTypes.get(process);
        const type = processInfo ? processInfo.type : 'unknown';
        
        // Don't kill FFmpeg processes that are actively working
        if (type === 'ffmpeg' && this.isProcessActive(process)) {
            console.log(`[ProcessManager] Skipping active FFmpeg process PID ${process.pid} - still processing`);
            return;
        }
        
        try {
            // IMPROVED: For FFmpeg processes, try graceful shutdown first, then force kill if needed
            if (type === 'ffmpeg') {
                console.log(`[ProcessManager] Gracefully shutting down FFmpeg process PID ${process.pid}`);
                process.kill('SIGTERM');
                
                // Wait for graceful shutdown (FFmpeg needs time to finish processing)
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Force kill only if still alive after graceful shutdown
                if (!process.killed) {
                    console.log(`[ProcessManager] Force killing FFmpeg process PID ${process.pid} after graceful shutdown failed`);
                    process.kill('SIGKILL');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                // Try graceful shutdown first for other processes
                process.kill('SIGTERM');
                
                // Wait for graceful shutdown
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Force kill if still alive
                if (!process.killed) {
                    console.log(`[ProcessManager] Force killing ${type} process PID ${process.pid}`);
                    process.kill('SIGKILL');
                    
                    // Wait for force kill
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (process.killed) {
                console.log(`[ProcessManager] Successfully killed ${type} process PID ${process.pid}`);
            } else {
                console.warn(`[ProcessManager] ${type} process PID ${process.pid} still alive after SIGKILL`);
            }
        } catch (error) {
            console.warn(`[ProcessManager] Error killing ${type} process PID ${process.pid}:`, error.message);
        }
    }
    
    /**
     * Get debug info with memory usage
     */
    getDebugInfo() {
        const info = {};
        for (const [guildId, processes] of this.guildProcesses) {
            info[guildId] = {
                count: processes.size,
                processes: Array.from(processes).map(p => {
                    const processInfo = this.processTypes.get(p);
                    const memoryInfo = this.processMemory.get(p);
                    return {
                        pid: p.pid,
                        killed: p.killed,
                        type: processInfo?.type || 'unknown',
                        memoryMB: memoryInfo ? Math.round(memoryInfo.rss / 1024 / 1024) : 0,
                        age: processInfo ? Math.round((Date.now() - processInfo.startTime) / 1000) : 0
                    };
                })
            };
        }
        return info;
    }

    /**
     * Log detailed memory map showing all Maps and their contents
     */
    logDetailedMemoryMap() {
        try {
            console.log(`[MemoryMap] 🔍 DETAILED MEMORY ANALYSIS:`);
            
            // Process Manager Maps
            console.log(`[MemoryMap] Process Manager Maps:`);
            console.log(`  - guildProcesses: ${this.guildProcesses.size} entries`);
            for (const [guildId, processes] of this.guildProcesses) {
                console.log(`    Guild ${guildId}: ${processes.size} processes`);
                for (const process of processes) {
                    const processInfo = this.processTypes.get(process);
                    const memoryInfo = this.processMemory.get(process);
                    const memoryMB = memoryInfo ? Math.round(memoryInfo.rss / 1024 / 1024) : 0;
                    const age = processInfo ? Math.round((Date.now() - processInfo.startTime) / 1000) : 0;
                    console.log(`      PID ${process.pid}: ${processInfo?.type || 'unknown'} (${memoryMB}MB, ${age}s old, killed: ${process.killed})`);
                }
            }
            
            console.log(`  - processTypes: ${this.processTypes.size} entries`);
            console.log(`  - processMemory: ${this.processMemory.size} entries`);
            
            // Check for other Maps in the application
            this.logApplicationMaps();
            
            // Node.js memory usage
            const memUsage = process.memoryUsage();
            console.log(`[MemoryMap] Node.js Memory Usage:`);
            console.log(`  - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
            console.log(`  - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
            console.log(`  - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
            console.log(`  - External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
            console.log(`  - Array Buffers: ${Math.round(memUsage.arrayBuffers / 1024 / 1024)}MB`);
            
        } catch (error) {
            console.error(`[MemoryMap] Error logging memory map:`, error);
        }
    }

    /**
     * Log other application Maps that might be consuming memory
     */
    async logApplicationMaps() {
        try {
            console.log(`[MemoryMap] Application Maps:`);
            
            // Unified Ytdlp Service Maps
            try {
                const { unifiedYtdlpService } = await import('../processors/unified-ytdlp-service.js');
                console.log(`  - activeQueries: ${unifiedYtdlpService.activeQueries?.size || 0} entries`);
                console.log(`  - recentlyCompletedQueries: ${unifiedYtdlpService.recentlyCompletedQueries?.size || 0} entries`);
                
                // Show active queries details
                if (unifiedYtdlpService.activeQueries?.size > 0) {
                    console.log(`    Active Queries:`);
                    for (const [query, data] of unifiedYtdlpService.activeQueries) {
                        const age = Math.round((Date.now() - data.timestamp) / 1000);
                        console.log(`      "${query}": ${age}s old, PID ${data.process?.pid || 'unknown'}`);
                    }
                }
            } catch (error) {
                console.log(`  - UnifiedYtdlpService: Error loading (${error.message})`);
            }
            
            // Audio Session Maps
            try {
                const { guildAudioSessions } = await import('../../handlers/common/audio-session.js');
                console.log(`  - guildAudioSessions: ${guildAudioSessions?.size || 0} entries`);
                
                if (guildAudioSessions?.size > 0) {
                    console.log(`    Active Sessions:`);
                    for (const [guildId, session] of guildAudioSessions) {
                        const hasNowPlaying = !!session.nowPlaying;
                        const queueLength = session.queue?.length || 0;
                        const hasAudioResource = !!session.audioResource;
                        console.log(`      Guild ${guildId}: nowPlaying=${hasNowPlaying}, queue=${queueLength}, audioResource=${hasAudioResource}`);
                    }
                }
            } catch (error) {
                console.log(`  - AudioSessions: Error loading (${error.message})`);
            }
            
            // Queue Saver Maps
            try {
                const { queueSaver } = await import('../queue-saver.js');
                console.log(`  - savedPlaylists: ${queueSaver.savedPlaylists?.size || 0} entries`);
                console.log(`  - autoSaveEnabled: ${queueSaver.autoSaveEnabled?.size || 0} entries`);
            } catch (error) {
                console.log(`  - QueueSaver: Error loading (${error.message})`);
            }
            
            // Menu Component Handlers Maps
            try {
                const { cleanupOldMapData } = await import('../../handlers/menu-component-handlers.js');
                console.log(`  - MenuComponentHandlers: Maps loaded via import`);
            } catch (error) {
                console.log(`  - MenuComponentHandlers: Error loading (${error.message})`);
            }
            
            // Message Manager Maps
            try {
                const { cleanupOldMessageLocks } = await import('../helpers/message-helpers.js');
                console.log(`  - MessageManager: Maps loaded via import`);
            } catch (error) {
                console.log(`  - MessageManager: Error loading (${error.message})`);
            }
            
            // Rate Limiting Maps
            try {
                const { cleanupOldRateLimitData } = await import('../../middleware/rate-limiting-middleware.js');
                console.log(`  - RateLimiting: Maps loaded via import`);
            } catch (error) {
                console.log(`  - RateLimiting: Error loading (${error.message})`);
            }
            
            // Pending Queue Maps
            try {
                const { cleanupOldPendingQueues } = await import('../core/pending-queue.js');
                console.log(`  - PendingQueue: Maps loaded via import`);
            } catch (error) {
                console.log(`  - PendingQueue: Error loading (${error.message})`);
            }
            
            // Commands Maps
            try {
                const { cleanupService } = await import('./cleanup-service.js');
                console.log(`  - Commands: Maps loaded via import`);
            } catch (error) {
                console.log(`  - Commands: Error loading (${error.message})`);
            }
            
        } catch (error) {
            console.error(`[MemoryMap] Error logging application maps:`, error);
        }
    }
}

// Export singleton instance
export const processManager = new ProcessManager();
export default processManager;
