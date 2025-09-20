// utils/functions/audio-utils.js
/**
 * Audio processing and validation utilities
 * Handles audio-related helper functions
 */

/**
 * Converts volume percentage to decimal (0-1)
 * @param {number} volumePercent - Volume as percentage (0-100)
 * @returns {number} - Volume as decimal (0-1)
 */
export function volumePercentToDecimal(volumePercent) {
  return Math.max(0, Math.min(1, volumePercent / 100));
}

/**
 * Converts volume decimal to percentage
 * @param {number} volumeDecimal - Volume as decimal (0-1)
 * @returns {number} - Volume as percentage (0-100)
 */
export function volumeDecimalToPercent(volumeDecimal) {
  return Math.max(0, Math.min(100, Math.round(volumeDecimal * 100)));
}

/**
 * Validates volume level
 * @param {number} volume - Volume to validate
 * @returns {Object} - Validation result
 */
export function validateVolume(volume) {
  if (typeof volume !== 'number' || isNaN(volume)) {
    return {
      isValid: false,
      message: 'Volume must be a number',
      correctedVolume: 50
    };
  }
  
  if (volume < 0) {
    return {
      isValid: false,
      message: 'Volume cannot be negative',
      correctedVolume: 0
    };
  }
  
  if (volume > 100) {
    return {
      isValid: false,
      message: 'Volume cannot exceed 100%',
      correctedVolume: 100
    };
  }
  
  return {
    isValid: true,
    message: 'Volume is valid',
    correctedVolume: volume
  };
}

/**
 * Gets audio quality description
 * @param {string} quality - Audio quality string
 * @returns {string} - Human-readable quality description
 */
export function getAudioQualityDescription(quality) {
  const qualityMap = {
    'low': 'Low quality (64kbps)',
    'medium': 'Medium quality (128kbps)',
    'high': 'High quality (192kbps)',
    'best': 'Best available quality'
  };
  
  return qualityMap[quality] || 'Unknown quality';
}

