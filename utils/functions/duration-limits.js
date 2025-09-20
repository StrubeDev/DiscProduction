// utils/functions/duration-limits.js
/**
 * Duration limit checking and validation functions
 * Handles all logic related to song duration limits for guilds
 */

/**
 * Checks if a video duration is within the allowed limit for a guild
 * @param {number} durationSeconds - The duration of the video in seconds
 * @param {number} maxDurationSeconds - The maximum allowed duration in seconds (0 means no limit)
 * @returns {Object} - Object with isAllowed boolean and formatted duration strings
 */
export function checkDurationLimit(durationSeconds, maxDurationSeconds) {
  if (!durationSeconds || maxDurationSeconds === null || maxDurationSeconds === undefined) {
    return {
      isAllowed: true,
      durationFormatted: durationSeconds ? formatDuration(durationSeconds) : 'Unknown',
      maxDurationFormatted: maxDurationSeconds === 0 ? 'No limit' : 'Unknown'
    };
  }

  // If maxDurationSeconds is 0, it means no limit
  if (maxDurationSeconds === 0) {
    return {
      isAllowed: true,
      durationFormatted: formatDuration(durationSeconds),
      maxDurationFormatted: 'No limit',
      durationSeconds,
      maxDurationSeconds: 0
    };
  }

  const isAllowed = durationSeconds <= maxDurationSeconds;
  
  return {
    isAllowed,
    durationFormatted: formatDuration(durationSeconds),
    maxDurationFormatted: formatDuration(maxDurationSeconds),
    durationSeconds,
    maxDurationSeconds
  };
}

/**
 * Formats duration in seconds to a human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration string (e.g., "3m 30s", "45s", "1h 15m")
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts = [];
  
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }
  
  return parts.join(' ');
}

/**
 * Validates duration limit settings for a guild
 * @param {number} maxDurationSeconds - The maximum duration setting to validate
 * @returns {Object} - Validation result with isValid boolean and message
 */
export function validateDurationLimitSetting(maxDurationSeconds) {
  if (maxDurationSeconds === null || maxDurationSeconds === undefined) {
    return {
      isValid: false,
      message: 'Duration limit cannot be null or undefined'
    };
  }
  
  if (maxDurationSeconds < 0) {
    return {
      isValid: false,
      message: 'Duration limit cannot be negative'
    };
  }
  
  if (maxDurationSeconds > 86400) { // 24 hours
    return {
      isValid: false,
      message: 'Duration limit cannot exceed 24 hours'
    };
  }
  
  return {
    isValid: true,
    message: 'Duration limit setting is valid'
  };
}

/**
 * Gets a user-friendly description of the duration limit
 * @param {number} maxDurationSeconds - The maximum duration in seconds
 * @returns {string} - Human-readable description
 */
export function getDurationLimitDescription(maxDurationSeconds) {
  if (maxDurationSeconds === 0) {
    return 'No limit - any length song can be played';
  }
  
  const formatted = formatDuration(maxDurationSeconds);
  return `Maximum song length: ${formatted}`;
}
