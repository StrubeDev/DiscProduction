/**
 * Central Handler Registry
 * Single source of truth for all Discord interaction handlers
 */

// Core handlers
export * from './core/play-command.js';

// UI handlers
export * from './ui/handlers/bot-control-handlers.js';
export * from './ui/handlers/remote-controls.js';

// Modal handlers
export * from './ui/modals/add-song-modal.js';

// Tools handlers
export * from './tools/index.js';

// Message handlers (re-exported for backward compatibility)
export { updatePlaybackControlsEmbed } from '../message/update-handlers.js';

// Voice timeout utilities (re-exported for convenience)
export { clearVoiceTimeout, startOrResetVoiceTimeout } from '../utils/timeout/voice-timeouts.js';

// Queue display preferences (re-exported for convenience)
export { guildQueueDisplayPreference } from '../utils/queue/display-preferences.js';