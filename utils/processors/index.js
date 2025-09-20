// utils/processors/index.js
/**
 * Audio processing exports
 * Audio processing and media handling
 */

export { processAudioWithFFmpeg } from './ffmpeg-processor.js';
export { UnifiedYtdlpService } from './unified-ytdlp-service.js';

// Create singleton instance for easy importing
export const unifiedYtdlpService = new UnifiedYtdlpService();

