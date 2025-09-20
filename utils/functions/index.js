// utils/functions/index.js
/**
 * Centralized exports for all utility functions
 * This makes importing functions cleaner and more organized
 */

// Duration limit functions
export {
  checkDurationLimit,
  formatDuration,
  validateDurationLimitSetting,
  getDurationLimitDescription
} from './duration-limits.js';

// Audio utility functions
export {
  volumePercentToDecimal,
  volumeDecimalToPercent,
  validateVolume,
  getAudioQualityDescription
} from './audio-utils.js';

// Queue utility functions
export {
  isDuplicateSong,
  getQueuePosition,
  calculateWaitTime,
  formatQueuePosition,
  getQueueStats
} from './queue-utils.js';

// Permission utility functions
export {
  hasModPermissions,
  hasAdminPermissions,
  getPermissionLevel,
  canUseModCommands,
  canUseAdminCommands
} from './permission-utils.js';
