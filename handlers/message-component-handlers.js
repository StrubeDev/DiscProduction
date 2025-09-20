/**
 * Central Message Handler Registry
 * Single source of truth for all Discord message operations
 */

// Message update handlers
export * from '../message/update-handlers.js';

// Message content generators
export * from '../message/content-generators.js';

// Message reference managers
export * from '../message/reference-managers.js';

// Re-export key functions for convenience
export { 
    updatePlaybackControlsEmbed,
    updateQueueMessage,
    updateErrorEmbed,
    updateLoadingMessage
} from '../message/update-handlers.js';
