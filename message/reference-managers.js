/**
 * Message Reference Managers
 * Centralized management of Discord message references
 */

import { guildAudioSessions } from '../utils/core/audio-state.js';
import { upsertMessageRef, getMessageRefDb, deleteMessageRef } from '../utils/database/messageRefs.js';

// Independent message reference storage (not tied to audio sessions)
const messageReferences = new Map();

// Message types for consistent reference management
export const MESSAGE_TYPES = {
    PLAYBACK_CONTROLS: 'playback_controls',
    QUEUE_MESSAGE: 'queue_message',
    ERROR_EMBED: 'error_embed',
    LOADING_MESSAGE: 'loading_message'
};

/**
 * Message Reference Manager Class
 * Handles storage and retrieval of Discord message references
 */
export class MessageReferenceManager {
    /**
     * Store a message reference in the session
     * @param {string} guildId - Guild ID
     * @param {string} type - Message type (from MESSAGE_TYPES)
     * @param {string} messageId - Discord message ID
     * @param {string} channelId - Discord channel ID
     */
    static async storeMessageRef(guildId, type, messageId, channelId) {
        // Get or create guild message references
        if (!messageReferences.has(guildId)) {
            messageReferences.set(guildId, new Map());
        }
        
        const guildRefs = messageReferences.get(guildId);
        
        // Store the reference
        guildRefs.set(type, {
            messageId,
            channelId,
            storedAt: Date.now()
        });
        
        console.log(`[MessageRefManager] Stored ${type} message reference for guild ${guildId}: ${messageId}`);
        // Persist to DB
        try {
            await upsertMessageRef(guildId, type, channelId, messageId);
        } catch (e) {
            console.warn(`[MessageRefManager] DB upsert failed for ${type} in guild ${guildId}:`, e.message);
        }
        return true;
    }
    
    /**
     * Get a message reference from the session
     * @param {string} guildId - Guild ID
     * @param {string} type - Message type (from MESSAGE_TYPES)
     * @returns {Object|null} Message reference object or null
     */
    static async getMessageRef(guildId, type) {
        let guildRefs = messageReferences.get(guildId);
        if (guildRefs && guildRefs.has(type)) {
            return guildRefs.get(type);
        }
        // Fallback to DB
        try {
            const dbRef = await getMessageRefDb(guildId, type);
            if (dbRef) {
                if (!messageReferences.has(guildId)) {
                    messageReferences.set(guildId, new Map());
                }
                guildRefs = messageReferences.get(guildId);
                const ref = { ...dbRef, storedAt: Date.now() };
                guildRefs.set(type, ref);
                return ref;
            }
        } catch (e) {
            console.warn(`[MessageRefManager] DB get failed for ${type} in guild ${guildId}:`, e.message);
        }
        return null;
    }
    
    /**
     * Clear a message reference from the session
     * @param {string} guildId - Guild ID
     * @param {string} type - Message type (from MESSAGE_TYPES)
     */
    static async clearMessageRef(guildId, type) {
        const guildRefs = messageReferences.get(guildId);
        if (!guildRefs) {
            return false;
        }
        
        const removed = guildRefs.delete(type);
        if (removed) {
            console.log(`[MessageRefManager] Cleared ${type} message reference for guild ${guildId}`);
        }
        
        try {
            await deleteMessageRef(guildId, type);
        } catch (e) {
            console.warn(`[MessageRefManager] DB delete failed for ${type} in guild ${guildId}:`, e.message);
        }
        
        return removed;
    }
    
    /**
     * Clear all message references for a guild
     * @param {string} guildId - Guild ID
     */
    static clearAllMessageRefs(guildId) {
        const guildRefs = messageReferences.get(guildId);
        if (!guildRefs) {
            return false;
        }
        
        guildRefs.clear();
        console.log(`[MessageRefManager] Cleared all message references for guild ${guildId}`);
        
        // Also clear from audio session if it exists (for backward compatibility)
        const session = guildAudioSessions.get(guildId);
        if (session) {
            session.playbackControlsMessage = null;
            session.queueMessage = null;
        }
        
        return true;
    }
    
    /**
     * Get all message references for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Object containing all message references
     */
    static getAllMessageRefs(guildId) {
        const session = guildAudioSessions.get(guildId);
        if (!session || !session.messageReferences) {
            return {};
        }
        
        const refs = {};
        for (const [type, ref] of session.messageReferences) {
            refs[type] = ref;
        }
        
        return refs;
    }
    
    /**
     * Check if a message reference exists
     * @param {string} guildId - Guild ID
     * @param {string} type - Message type (from MESSAGE_TYPES)
     * @returns {boolean} True if reference exists
     */
    static hasMessageRef(guildId, type) {
        const ref = this.getMessageRef(guildId, type);
        return ref !== null && ref.messageId && ref.channelId;
    }
    
    /**
     * Validate a message reference (check if message still exists)
     * @param {string} guildId - Guild ID
     * @param {string} type - Message type (from MESSAGE_TYPES)
     * @param {Object} djsClient - Discord.js client
     * @returns {Promise<boolean>} True if message is valid
     */
    static async validateMessageRef(guildId, type, djsClient) {
        const ref = this.getMessageRef(guildId, type);
        if (!ref) {
            return false;
        }
        
        try {
            const channel = await djsClient.channels.fetch(ref.channelId);
            if (!channel || !channel.isTextBased()) {
                return false;
            }
            
            const message = await channel.messages.fetch(ref.messageId);
            return message !== null;
        } catch (error) {
            console.log(`[MessageRefManager] Message validation failed for ${type} in guild ${guildId}:`, error.message);
            return false;
        }
    }
}
