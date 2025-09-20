// utils/ffmpeg-processor.js
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { processManager } from '../services/process-manager.js';
import { fileNamingService } from '../services/file-naming-service.js';

/**
 * Unified FFmpeg processing function - handles both new downloads and preloaded files
 */
export async function processAudioWithFFmpeg(tempFile, guildId, volume = 100, isPreloaded = false, metadata = null) {
    console.log(`[FFmpegProcessor] 🎵 STARTING FFmpeg processing: ${tempFile} (preloaded: ${isPreloaded})`);
    
    return new Promise((resolve, reject) => {
        try {
            // CRITICAL: Apply volume in FFmpeg to prevent memory accumulation
            const volumeScale = volume / 100;
            const volumeFilter = volumeScale !== 1.0 ? `volume=${volumeScale}` : '';
            const audioFilters = [
                'loudnorm=I=-23:LRA=7:TP=-2.0', // More aggressive normalization (quieter)
                volumeFilter
            ].filter(Boolean).join(','); // Remove empty filters
            
            // If no filters, don't use -af parameter
            const hasFilters = audioFilters && audioFilters.trim() !== '';
            
            // Create processed temp file path using centralized naming service
            // UNIFIED: Use the same naming pattern for all processed files
            const processedTempFile = fileNamingService.generateProcessedFileName(tempFile);
            
            const ffmpegArgs = [
                '-y',                    // CRITICAL: Automatically overwrite output files
                '-i', tempFile
            ];
            
            // Only add audio filters if we have them
            if (hasFilters) {
                ffmpegArgs.push('-af', audioFilters);
            }
            
            // Add output format and codec settings
            ffmpegArgs.push(
                '-f', 'opus',
                '-acodec', 'libopus',
                '-ar', '48000',
                '-ac', '2',
                '-b:a', '128k',
                '-loglevel', 'error',
                // CRITICAL: Memory management to prevent accumulation
                '-bufsize', '64k',        // Limit input buffer size
                '-maxrate', '128k',       // Limit output rate
                '-threads', '1',          // Single thread to reduce memory usage
                // CRITICAL: Ensure proper stream ending
                '-avoid_negative_ts', 'make_zero',  // Fix timestamp issues
                '-fflags', '+genpts',     // Generate presentation timestamps
                '-shortest',              // End when shortest input ends
                processedTempFile // Output to processed temp file
            );
    
            console.log(`[FFmpegProcessor] FFmpeg args: ${ffmpegArgs.join(' ')}`);
            
            // Use ffmpeg directly in Linux Docker, ffmpeg.exe in Windows
            const isDocker = process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production';
            const ffmpegCmd = (process.platform === 'win32' && !isDocker) ? 'ffmpeg.exe' : 'ffmpeg';
            console.log(`[FFmpegProcessor] Using FFmpeg command: ${ffmpegCmd} (isDocker: ${isDocker}, platform: ${process.platform})`);
            
            // Redirect stdout to /dev/null to prevent hanging, but keep stderr for error handling
            const ffmpegProcess = spawn(ffmpegCmd, ffmpegArgs, {
                stdio: ['pipe', 'ignore', 'pipe'] // stdin: pipe, stdout: ignore, stderr: pipe
            });
            
            // CRITICAL: Add FFmpeg process to tracking for cleanup
            processManager.addProcess(ffmpegProcess, guildId, 'ffmpeg');
            
            // Wait for FFmpeg to complete, then create audio resource from processed file
            ffmpegProcess.on('exit', (code, signal) => {
                console.log(`[FFmpegProcessor] FFmpeg process exited with code ${code}, signal ${signal}`);
                
                if (code === 0) {
                    // FFmpeg completed successfully, create audio resource from processed file
                    try {
                        console.log(`[FFmpegProcessor] Creating audio resource from processed file: ${processedTempFile}`);
                        
                        // Check if processed file exists and has content
                        if (!existsSync(processedTempFile)) {
                            reject(new Error('Processed file not found or empty'));
                            return;
                        }
                        
                        // Create file stream for the processed audio
                        const fileStream = createReadStream(processedTempFile);
                        
                        const audioResource = createAudioResource(fileStream, {
                            inputType: StreamType.OggOpus,
                            metadata: {
                                title: metadata?.title || 'Processed Audio',
                                duration: metadata?.duration || 0
                            }
                        });
                        
                        // Store the processed temp file path for cleanup
                        audioResource._processedTempFile = processedTempFile;
                        
                        console.log(`[FFmpegProcessor] ✅ Audio resource created successfully for: ${metadata?.title || 'Unknown Title'}`);
                        
                        resolve({
                            audioResource,
                            tempFile: processedTempFile,
                            metadata: {
                                title: metadata?.title || 'Processed Audio',
                                duration: metadata?.duration || 0,
                                uploader: metadata?.uploader || 'Unknown',
                                thumbnail: metadata?.thumbnail || null
                            }
                        });
                        
                    } catch (error) {
                        console.error(`[FFmpegProcessor] Error creating audio resource:`, error);
                        reject(error);
                    }
                } else {
                    console.error(`[FFmpegProcessor] FFmpeg process failed with code ${code}, signal ${signal}`);
                    reject(new Error(`FFmpeg process failed with code ${code}`));
                }
            });
            
            // Handle FFmpeg errors
            ffmpegProcess.on('error', (error) => {
                console.error(`[FFmpegProcessor] FFmpeg process error:`, error);
                reject(error);
            });
            
            // Handle FFmpeg stderr for debugging
            ffmpegProcess.stderr.on('data', (data) => {
                const stderr = data.toString();
                if (stderr.includes('error') || stderr.includes('Error')) {
                    console.error(`[FFmpegProcessor] FFmpeg stderr: ${stderr}`);
                }
            });
            
        } catch (error) {
            console.error(`[FFmpegProcessor] Error in processAudioWithFFmpeg:`, error);
            reject(error);
        }
    });
}
