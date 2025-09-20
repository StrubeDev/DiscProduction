// utils/services/file-deletion-service.js
/**
 * Centralized File Deletion Service
 * 
 * ALL file deletion logic should go through this service
 * This ensures consistent cleanup behavior across the entire application
 */

import { existsSync, unlinkSync } from 'fs';
import { fileNamingService } from './file-naming-service.js';

class FileDeletionService {
    constructor() {
        console.log('[FileDeletionService] Service loaded successfully');
    }

    /**
     * Delete a single file if it exists
     * @param {string} filePath - Path to the file to delete
     * @param {string} context - Context for logging (e.g., "song cleanup", "session cleanup")
     * @returns {boolean} True if file was deleted, false if it didn't exist or couldn't be deleted
     */
    deleteFile(filePath, context = 'unknown') {
        if (!filePath) {
            console.log(`[FileDeletionService] No file path provided for ${context}`);
            return false;
        }

        // Check if we're running in Docker
        const isDocker = process.env.DOCKER_ENV === 'true';
        const maxRetries = isDocker ? 5 : 3;
        const retryDelay = isDocker ? 1000 : 500;

        return this._deleteFileWithRetry(filePath, context, maxRetries, retryDelay);
    }

    /**
     * Internal method to delete file with retry logic
     * @param {string} filePath - Path to the file to delete
     * @param {string} context - Context for logging
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} retryDelay - Delay between retries in milliseconds
     * @returns {boolean} True if file was deleted, false if it couldn't be deleted
     */
    _deleteFileWithRetry(filePath, context, maxRetries, retryDelay) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (existsSync(filePath)) {
                    unlinkSync(filePath);
                    console.log(`[FileDeletionService] ✅ Deleted file (${context}) attempt ${attempt}: ${filePath}`);
                    return true;
                } else {
                    console.log(`[FileDeletionService] ⚠️ File not found (${context}) attempt ${attempt}: ${filePath}`);
                    return false; // File doesn't exist, consider it "deleted"
                }
            } catch (error) {
                const isLastAttempt = attempt === maxRetries;
                const isRetryableError = this._isRetryableError(error);
                
                console.error(`[FileDeletionService] ❌ Error deleting file (${context}) attempt ${attempt}/${maxRetries} ${filePath}:`, error.message);
                
                if (isRetryableError && !isLastAttempt) {
                    console.log(`[FileDeletionService] 🔄 Retrying deletion in ${retryDelay}ms... (${context})`);
                    // Wait before retry
                    const start = Date.now();
                    while (Date.now() - start < retryDelay) {
                        // Busy wait for precise timing
                    }
                } else if (isLastAttempt) {
                    console.error(`[FileDeletionService] ❌ Final deletion attempt failed: ${filePath} - ${error.message}`);
                    return false;
                } else {
                    // Non-retryable error
                    return false;
                }
            }
        }
        return false;
    }

    /**
     * Check if an error is retryable
     * @param {Error} error - The error to check
     * @returns {boolean} True if the error is retryable
     */
    _isRetryableError(error) {
        const retryableCodes = ['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE'];
        const retryableMessages = ['in use', 'permission denied', 'resource busy', 'too many open files'];
        
        return retryableCodes.includes(error.code) || 
               retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
    }

    /**
     * Delete all files in an array
     * @param {string[]} filePaths - Array of file paths to delete
     * @param {string} context - Context for logging
     * @returns {Object} Summary of deletion results
     */
    deleteFiles(filePaths, context = 'unknown') {
        if (!Array.isArray(filePaths) || filePaths.length === 0) {
            console.log(`[FileDeletionService] No files to delete for ${context}`);
            return { total: 0, deleted: 0, notFound: 0, errors: 0 };
        }

        console.log(`[FileDeletionService] 🗑️ Deleting ${filePaths.length} files for ${context}`);
        
        let deleted = 0;
        let notFound = 0;
        let errors = 0;

        for (const filePath of filePaths) {
            if (this.deleteFile(filePath, context)) {
                deleted++;
            } else if (!existsSync(filePath)) {
                notFound++;
            } else {
                errors++;
            }
        }

        const result = { total: filePaths.length, deleted, notFound, errors };
        console.log(`[FileDeletionService] ✅ Deletion complete for ${context}:`, result);
        return result;
    }

    /**
     * Delete all temp files for a song (including all variants)
     * @param {Object} song - Song object with file references
     * @param {string} context - Context for logging
     * @returns {Object} Summary of deletion results
     */
    deleteSongFiles(song, context = 'song cleanup') {
        if (!song) {
            console.log(`[FileDeletionService] No song object provided for ${context}`);
            return { total: 0, deleted: 0, notFound: 0, errors: 0 };
        }

        console.log(`[FileDeletionService] 🗑️ CLEANING FILES for song: "${song.title}" (${context})`);
        
        // Collect ALL possible temp file paths from song object
        const tempFileSources = [
            song.tempFile,
            song.streamDetails?.tempFile,
            song.preloadedTempFile,
            song.processedTempFile,
            song.streamDetails?.audioResource?._tempFile,
            song.streamDetails?.audioResource?._processedTempFile
        ];

        const tempFilesToDelete = [];

        // Add temp files and ALL their possible processed variants
        for (const tempFile of tempFileSources) {
            if (tempFile) {
                tempFilesToDelete.push(tempFile);
                
                // Use centralized naming service to get all file variants
                const processedVariants = fileNamingService.getAllFileVariants(tempFile);
                
                // Add all variants
                for (const variant of processedVariants) {
                    if (variant && variant !== tempFile && !tempFilesToDelete.includes(variant)) {
                        tempFilesToDelete.push(variant);
                    }
                }
            }
        }

        return this.deleteFiles(tempFilesToDelete, context);
    }

    /**
     * Delete files from an audio resource
     * @param {Object} audioResource - Audio resource with file references
     * @param {string} context - Context for logging
     * @returns {Object} Summary of deletion results
     */
    deleteAudioResourceFiles(audioResource, context = 'audio resource cleanup') {
        if (!audioResource) {
            console.log(`[FileDeletionService] No audio resource provided for ${context}`);
            return { total: 0, deleted: 0, notFound: 0, errors: 0 };
        }

        const filePaths = [
            audioResource._tempFile,
            audioResource._processedTempFile
        ].filter(Boolean);

        return this.deleteFiles(filePaths, context);
    }

    /**
     * Clean up all temp files in the temp directory
     * @param {string} context - Context for logging
     * @returns {Object} Summary of deletion results
     */
    async cleanupTempDirectory(context = 'temp directory cleanup') {
        try {
            const { readdir } = await import('fs/promises');
            const tempFiles = await readdir('temp');
            
            const audioFiles = tempFiles.filter(file => 
                fileNamingService.isTempAudioFile(file)
            );

            const filePaths = audioFiles.map(file => `temp/${file}`);
            return this.deleteFiles(filePaths, context);
        } catch (error) {
            console.error(`[FileDeletionService] ❌ Error cleaning temp directory:`, error.message);
            return { total: 0, deleted: 0, notFound: 0, errors: 1 };
        }
    }
}

// Export singleton instance
export const fileDeletionService = new FileDeletionService();
