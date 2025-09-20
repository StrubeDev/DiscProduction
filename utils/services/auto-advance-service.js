// utils/services/auto-advance-service.js
// Dedicated service for handling automatic queue progression

/**
 * Auto-Advance Service
 * Handles automatic progression to the next song in the queue when a song finishes
 */
class AutoAdvanceService {
    constructor() {
        this.advanceInProgress = new Map(); // guildId -> boolean (prevents duplicate advances)
        console.log('[AutoAdvanceService] Service initialized');
    }

    /**
     * Handle auto-advance when a song finishes
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     * @param {Object} djsClient - Discord client
     * @param {Object} player - Audio player
     * @returns {Promise<boolean>} - True if auto-advance was triggered, false otherwise
     */
    async handleAutoAdvance(guildId, session, djsClient, player) {
        console.log(`[AutoAdvanceService] 🔄 Handling auto-advance for guild ${guildId}`);
        
        // Check if already processing auto-advance for this guild
        if (this.advanceInProgress.has(guildId)) {
            console.log(`[AutoAdvanceService] ⚠️ Auto-advance already in progress for guild ${guildId}, skipping`);
            return false;
        }

        // Check if auto-advance should be triggered
        const shouldAutoAdvance = this.shouldTriggerAutoAdvance(session, player);
        
        console.log(`[AutoAdvanceService] 🔍 Auto-advance check:`, {
            autoAdvanceQueue: session.autoAdvanceQueue,
            hasQueue: !!session.queue,
            queueLength: session.queue?.length || 0,
            shouldAutoAdvance,
            playerStatus: player.state.status,
            isStarting: session.isStarting
        });

        if (!shouldAutoAdvance) {
            console.log(`[AutoAdvanceService] ⚠️ Auto-advance not triggered for guild ${guildId}`);
            return false;
        }

        // Mark as in progress
        this.advanceInProgress.set(guildId, true);

        try {
            // DON'T shift the song from queue here - let the queue change handler do it
            // This prevents conflicts between auto-advance and queue change handlers
            const nextSong = session.queue[0]; // Just peek at the next song
            console.log(`[AutoAdvanceService] ✅ AUTO-ADVANCE: Next song ready for playback "${nextSong.title}"`);
            
            // The queue change handler will handle the actual playback
            // We just need to emit a queue changed event to trigger it
            console.log(`[AutoAdvanceService] 🔄 Emitting queueChanged event to trigger playback`);
            djsClient.emit('queueChanged', guildId, session);
            
            console.log(`[AutoAdvanceService] ✅ Auto-advance completed for guild ${guildId}`);
            return true;
            
        } catch (error) {
            console.error(`[AutoAdvanceService] ❌ Auto-advance failed for guild ${guildId}:`, error);
            return false;
        } finally {
            // Always clear the in-progress flag
            this.advanceInProgress.delete(guildId);
        }
    }

    /**
     * Check if auto-advance should be triggered
     * @param {Object} session - Audio session
     * @param {Object} player - Audio player
     * @returns {boolean} - True if auto-advance should trigger
     */
    shouldTriggerAutoAdvance(session, player) {
        // Basic checks
        if (!session.autoAdvanceQueue) {
            return false;
        }
        
        if (!session.queue || session.queue.length === 0) {
            return false;
        }
        
        if (player.state.status !== 'idle') {
            return false;
        }
        
        if (session.isStarting) {
            return false;
        }

        // Safety check: Reset isStarting if it's been stuck for too long (30 seconds)
        if (session.isStarting && session.lastStartingTime) {
            const timeSinceStarting = Date.now() - session.lastStartingTime;
            if (timeSinceStarting > 30000) {
                console.log(`[AutoAdvanceService] ⚠️ SAFETY RESET: isStarting has been true for ${timeSinceStarting}ms, resetting to prevent auto-advance blocking`);
                const { playerStateManager } = require('../core/player-state-manager.js');
                playerStateManager.setLoading(session.guildId, false);
                session.lastStartingTime = null;
            }
        }

        return true;
    }

    // Removed legacy loading sequence: state-driven embeds handle loading UI now

    /**
     * Play the next song with preload check
     * @param {string} guildId - Guild ID
     * @param {Object} nextSong - Next song object
     * @param {Object} djsClient - Discord client
     * @param {Object} session - Audio session
     */
    async playNextSong(guildId, nextSong, djsClient, session) {
        try {
            const { player } = await import('../../handlers/core/player.js');
            
            // Use the regular playSong method to check for preloaded data first
            // This ensures preloaded songs are used when available
            console.log(`[AutoAdvanceService] 🎵 Playing next song "${nextSong.title}" with preload check`);
            await player.playSong(guildId, nextSong, djsClient, session, null, null);
            
            // Run garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
        } catch (playError) {
            console.error(`[AutoAdvanceService] ❌ Error playing next song:`, playError);
            throw playError;
        }
    }

    /**
     * Check if auto-advance is enabled for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     * @returns {boolean} - True if auto-advance is enabled
     */
    isAutoAdvanceEnabled(guildId, session) {
        return session?.autoAdvanceQueue === true;
    }

    /**
     * Enable auto-advance for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    enableAutoAdvance(guildId, session) {
        if (session) {
            session.autoAdvanceQueue = true;
            console.log(`[AutoAdvanceService] ✅ Auto-advance enabled for guild ${guildId}`);
        }
    }

    /**
     * Disable auto-advance for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     */
    disableAutoAdvance(guildId, session) {
        if (session) {
            session.autoAdvanceQueue = false;
            console.log(`[AutoAdvanceService] ⏹️ Auto-advance disabled for guild ${guildId}`);
        }
    }

    /**
     * Get auto-advance status for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} session - Audio session
     * @returns {Object} - Status object with enabled flag and queue info
     */
    getAutoAdvanceStatus(guildId, session) {
        return {
            enabled: this.isAutoAdvanceEnabled(guildId, session),
            queueLength: session?.queue?.length || 0,
            hasQueue: !!(session?.queue && session.queue.length > 0),
            isAdvancing: this.advanceInProgress.has(guildId)
        };
    }

    /**
     * Clean up auto-advance state for a guild
     * @param {string} guildId - Guild ID
     */
    cleanupGuildState(guildId) {
        this.advanceInProgress.delete(guildId);
        console.log(`[AutoAdvanceService] 🧹 Cleaned up auto-advance state for guild ${guildId}`);
    }

    /**
     * Get all active auto-advance states (for debugging)
     * @returns {Object} - Map of guild IDs to their auto-advance states
     */
    getAllStates() {
        const states = {};
        for (const [guildId, isAdvancing] of this.advanceInProgress) {
            states[guildId] = { isAdvancing };
        }
        return states;
    }
}

// Export singleton instance
export const autoAdvanceService = new AutoAdvanceService();

// Convenience functions
export async function handleAutoAdvance(guildId, session, djsClient, player) {
    return await autoAdvanceService.handleAutoAdvance(guildId, session, djsClient, player);
}

export function isAutoAdvanceEnabled(guildId, session) {
    return autoAdvanceService.isAutoAdvanceEnabled(guildId, session);
}

export function enableAutoAdvance(guildId, session) {
    return autoAdvanceService.enableAutoAdvance(guildId, session);
}

export function disableAutoAdvance(guildId, session) {
    return autoAdvanceService.disableAutoAdvance(guildId, session);
}

export function getAutoAdvanceStatus(guildId, session) {
    return autoAdvanceService.getAutoAdvanceStatus(guildId, session);
}

export function cleanupAutoAdvanceState(guildId) {
    return autoAdvanceService.cleanupGuildState(guildId);
}
