/**
 * ImmediateProcessor - Handles immediate playback with loading screen
 * This is separate from Preloader which only handles queued songs
 */

import { createAudioResource } from '@discordjs/voice';
import { unifiedYtdlpService } from '../processors/unified-ytdlp-service.js';
import { processAudioWithFFmpeg } from '../processors/ffmpeg-processor.js';
import { fileNamingService } from './file-naming-service.js';
import { loadingSequenceHandler } from './loading-sequence-handler.js';

class ImmediateProcessor {
    constructor() {
        console.log('[ImmediateProcessor] Service loaded successfully');
    }

    /**
     * Process song for immediate playback with loading screen
     * @param {string} guildId - Guild ID
     * @param {Object} song - Song object
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     * @param {Object} options - Processing options
     */
    async processForImmediatePlayback(guildId, song, djsClient, session, options = {}) {
        console.log(`[ImmediateProcessor] 🚀 Processing for immediate playback: "${song.title}"`);
        
        try {
            // Start loading sequence (yellow -> green)
            await loadingSequenceHandler.startLoadingSequence(guildId, song, options.interactionDetails, song.query);
            console.log(`[ImmediateProcessor] ✅ Loading sequence started for: "${song.title}"`);

            // Download and process audio
            const audioData = await this.downloadAndProcessAudio(guildId, song);
            
            // Complete loading sequence (green -> playing)
            await loadingSequenceHandler.completeLoadingSequence(guildId, song);
            console.log(`[ImmediateProcessor] ✅ Loading sequence completed for: "${song.title}"`);

            // Store processed data in song object for Player
            song.streamDetails = {
                audioResource: audioData.audioResource,
                tempFile: audioData.tempFile,
                metadata: audioData.metadata
            };

            console.log(`[ImmediateProcessor] ✅ Song ready for immediate playback: "${song.title}"`);
            return song;

        } catch (error) {
            console.error(`[ImmediateProcessor] ❌ Error processing song:`, error);
            throw error;
        }
    }

    /**
     * Download and process audio for immediate playback
     * @param {string} guildId - Guild ID
     * @param {Object} song - Song object
     */
    async downloadAndProcessAudio(guildId, song) {
        console.log(`[ImmediateProcessor] 📥 Downloading audio for: "${song.title}"`);
        
        // Get audio stream from ytdlp
        const streamData = await unifiedYtdlpService.getAudioStream(song.query, guildId);
        
        // Process with FFmpeg
        const processedData = await processAudioWithFFmpeg(
            streamData.tempFile,
            guildId,
            100, // volume
            false, // not preloaded
            streamData.metadata
        );

        console.log(`[ImmediateProcessor] ✅ Audio processed for: "${song.title}"`);
        return processedData;
    }
}

export const immediateProcessor = new ImmediateProcessor();
