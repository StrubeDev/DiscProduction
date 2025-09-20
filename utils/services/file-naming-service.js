// utils/services/file-naming-service.js
/**
 * Unified File Naming Service
 * 
 * Handles naming for both downloads and processed files
 * - Downloads: temp_audio_*.opus
 * - Processed: processed_temp_audio_*.opus
 */

class FileNamingService {
    constructor() {
        console.log('[FileNamingService] Service loaded successfully');
    }

    /**
     * Generate a unique temp file name for downloads
     * @param {string} queryType - Type of query ('audio', 'preload', 'search', etc.)
     * @param {string} query - The actual query string (for uniqueness)
     * @returns {string} Unique temp file path
     */
    generateTempFileName(queryType = 'audio', query = '') {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substr(2, 9);
        
        // Create a hash of the query for additional uniqueness
        const queryHash = this.hashQuery(query);
        
        // Unified naming pattern for ALL download types
        const fileName = `temp_audio_${timestamp}_${randomString}_${queryHash}.opus`;
        const fullPath = `temp/${fileName}`;
        
        console.log(`[FileNamingService] Generated temp file: ${fullPath} (type: ${queryType})`);
        return fullPath;
    }

    /**
     * Generate processed file name from original temp file
     * @param {string} tempFile - Original temp file path
     * @returns {string} Processed file path
     */
    generateProcessedFileName(tempFile) {
        // Use consistent processed naming for ALL file types
        const processedFile = tempFile.replace('temp/', 'temp/processed_temp_');
        console.log(`[FileNamingService] Generated processed file: ${processedFile}`);
        return processedFile;
    }


    /**
     * Get all possible file variants for cleanup
     * @param {string} tempFile - Original temp file path
     * @returns {string[]} Array of all possible file variants
     */
    getAllFileVariants(tempFile) {
        const variants = [tempFile];
        
        if (tempFile) {
            // Add all possible processed variants
            const processedVariants = [
                this.generateProcessedFileName(tempFile),
                tempFile.replace('temp/temp_audio_', 'temp/processed_temp_audio_'),
                tempFile.replace('.opus', '_processed.opus').replace('temp/temp_audio_', 'temp/processed_temp_audio_')
            ];
            
            // Add unique variants
            for (const variant of processedVariants) {
                if (variant && variant !== tempFile && !variants.includes(variant)) {
                    variants.push(variant);
                }
            }
        }
        
        return variants;
    }

    /**
     * Create a hash of the query for uniqueness
     * @param {string} query - Query string
     * @returns {string} Hash string
     */
    hashQuery(query) {
        if (!query) return 'empty';
        
        // Simple hash function for query uniqueness
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36).substr(0, 8);
    }

    /**
     * Check if a file is a temp audio file
     * @param {string} fileName - File name to check
     * @returns {boolean} True if it's a temp audio file
     */
    isTempAudioFile(fileName) {
        return (fileName.includes('temp_audio_') && fileName.endsWith('.opus')) ||
               (fileName.includes('processed_temp_audio_') && fileName.endsWith('.opus'));
    }

    /**
     * Get file type from filename
     * @param {string} fileName - File name
     * @returns {string} File type ('original', 'processed')
     */
    getFileType(fileName) {
        if (fileName.includes('processed_temp_audio_')) {
            return 'processed';
        } else if (fileName.includes('temp_audio_')) {
            return 'original';
        }
        return 'unknown';
    }
}

// Export singleton instance
export const fileNamingService = new FileNamingService();
