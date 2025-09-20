/**
 * Message Update Handlers
 * Centralized handlers for updating Discord messages
 */

import { guildAudioSessions } from '../utils/core/audio-state.js';

// Debounce mechanism to prevent rapid embed updates
const updateTimeouts = new Map();

/**
 * Update playback controls embed
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} session - Audio session (optional, will fetch if not provided)
 */
export async function updatePlaybackControlsEmbed(guildId, djsClient, session = null) {
    try {
        console.log(`[MessageHandler] Updating playback controls embed for guild ${guildId}`);
        
        // DEBOUNCE: Clear existing timeout and set new one to prevent rapid updates
        if (updateTimeouts.has(guildId)) {
            clearTimeout(updateTimeouts.get(guildId));
        }
        
        const timeout = setTimeout(async () => {
            await performEmbedUpdate(guildId, djsClient, session);
            updateTimeouts.delete(guildId);
        }, 100); // 100ms debounce
        
        updateTimeouts.set(guildId, timeout);
        
    } catch (error) {
        console.error(`[MessageHandler] Error in updatePlaybackControlsEmbed for guild ${guildId}:`, error.message);
    }
}

/**
 * Perform the actual embed update
 */
async function performEmbedUpdate(guildId, djsClient, session = null) {
    try {
        console.log(`[MessageHandler] Performing embed update for guild ${guildId}`);
        
        // Get session if not provided
        if (!session) {
            session = guildAudioSessions.get(guildId);
        }
        
        // Allow updates even without session for loading states
        if (!session) {
            console.log(`[MessageHandler] No session found for guild ${guildId}, continuing with loading state update`);
        }
        
        // Check if we have a stored message reference (using MessageReferenceManager)
        const { MessageReferenceManager, MESSAGE_TYPES } = await import('./reference-managers.js');
        const messageRef = await MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
        
        if (!messageRef?.messageId || !messageRef?.channelId) {
            console.log(`[MessageHandler] No playback controls message reference found for guild ${guildId}, skipping update`);
            return;
        }
        
        // Message manager determines what screen to show based on state
        const { StateCoordinator } = await import('../services/state-coordinator.js');
        const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
        const stateType = trackedState?.currentState || 'idle';
        
        // Generate the new content using content generator
        const { generatePlaybackControlsContent } = await import('./content-generators.js');
        const newContent = await generatePlaybackControlsContent(guildId, djsClient, stateType, trackedState);
        
        // Get the channel and message
        const channel = await djsClient.channels.fetch(messageRef.channelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`[MessageHandler] Invalid channel for guild ${guildId}`);
            return;
        }
        
        const message = await channel.messages.fetch(messageRef.messageId);
        if (!message) {
            console.error(`[MessageHandler] Message not found for guild ${guildId}`);
            return;
        }
        
        // Update the message
        await message.edit(newContent);
        console.log(`[MessageHandler] ✅ Successfully updated playback controls embed for guild ${guildId}`);
        
    } catch (error) {
        console.error(`[MessageHandler] Error updating playback controls embed for guild ${guildId}:`, error.message);
        
        // If the message is invalid, clear the reference
        if (session && error.message.includes('Unknown Message')) {
            session.playbackControlsMessage = null;
            console.log(`[MessageHandler] Cleared invalid message reference for guild ${guildId}`);
        }
    }
}

/**
 * Update queue message (for chat mode)
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} session - Audio session
 */
export async function updateQueueMessage(guildId, djsClient, session) {
    try {
        console.log(`[MessageHandler] Updating queue message for guild ${guildId}`);
        
        if (!session) {
            session = guildAudioSessions.get(guildId);
        }
        
        if (!session) {
            console.warn(`[MessageHandler] No session found for guild ${guildId}`);
            return;
        }
        
        // Import the existing queue message function
        const { updatePersistentQueueMessage } = await import('../utils/helpers/message-helpers.js');
        await updatePersistentQueueMessage(guildId, djsClient, session);
        
        console.log(`[MessageHandler] ✅ Successfully updated queue message for guild ${guildId}`);
        
    } catch (error) {
        console.error(`[MessageHandler] Error updating queue message for guild ${guildId}:`, error.message);
    }
}

/**
 * Update error embed
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 */
export async function updateErrorEmbed(guildId, djsClient, errorType, errorMessage) {
    try {
        console.log(`[MessageHandler] Updating error embed for guild ${guildId}`);
        
        // Import the existing error tracking function
        const { trackError } = await import('../ui/services/error-tracking.js');
        await trackError(guildId, errorType, errorMessage, djsClient);
        
        console.log(`[MessageHandler] ✅ Successfully updated error embed for guild ${guildId}`);
        
    } catch (error) {
        console.error(`[MessageHandler] Error updating error embed for guild ${guildId}:`, error.message);
    }
}

/**
 * Update loading message
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} interactionDetails - Interaction details for webhook updates
 * @param {Object} embed - Embed content
 */
export async function updateLoadingMessage(guildId, djsClient, interactionDetails, embed) {
    try {
        console.log(`[MessageHandler] Updating loading message for guild ${guildId}`);
        
        // Use StateCoordinator instead of UnifiedLoadingService
        const { StateCoordinator } = await import('../services/state-coordinator.js');
        await StateCoordinator.notifyStateChange(guildId, 'loading', {
            embed,
            timestamp: Date.now()
        });
        
        console.log(`[MessageHandler] ✅ Successfully updated loading message for guild ${guildId}`);
        
    } catch (error) {
        console.error(`[MessageHandler] Error updating loading message for guild ${guildId}:`, error.message);
    }
}
