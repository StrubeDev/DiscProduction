// utils/core/index.js
/**
 * Core state management exports
 * Essential state management for the bot
 */

export {
  guildAudioSessions,
  getExistingSession,
  hasValidSession
} from './audio-state.js';

export {
  isGuildLocked,
  acquireGuildLock,
  releaseGuildLock,
  debugLocks,
  stopDeadlockCheck
} from './processing-locks.js';

export {
  addToPendingQueue,
  transferPendingQueue,
  cleanupGuildPendingQueue,
  cleanupOldPendingQueues,
  getPendingQueueSize
} from './pending-queue.js';

