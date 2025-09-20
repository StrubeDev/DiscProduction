/**
 * State Coordinator Service
 * Centralizes all state management between database, audio player, and UI embeds
 */
import { ClientService } from './client-service.js';

export class StateCoordinator {
    static stateListeners = new Map();
    static embedUpdateQueue = new Map();
    static updateTimeouts = new Map();

    /**
     * Register a state listener for a guild
     */
    static addStateListener(guildId, callback) {
        if (!this.stateListeners.has(guildId)) {
            this.stateListeners.set(guildId, []);
        }
        this.stateListeners.get(guildId).push(callback);
    }

    /**
     * Remove all state listeners for a guild
     */
    static removeStateListeners(guildId) {
        this.stateListeners.delete(guildId);
        this.clearEmbedUpdateQueue(guildId);
    }


    /**
     * Notify all listeners of a state change
     */
    static async notifyStateChange(guildId, stateType, data, priority = 2, userId = null) {
        // Import StateLockManager
        const { StateLockManager } = await import('./state-lock-manager.js');
        
        // Check rate limiting
        if (!await StateLockManager.rateLimitCheck(guildId, userId, stateType)) {
            console.log(`[StateCoordinator] 🚫 Rate limit exceeded for guild ${guildId}`);
            return;
        }
        
        // Check if state change is allowed
        if (!StateLockManager.isStateChangeAllowed(guildId, stateType, priority, userId)) {
            console.log(`[StateCoordinator] 🚫 State change blocked: ${stateType} for guild ${guildId} (locked state)`);
            
            // Queue the request instead of blocking
            StateLockManager.queueStateChange(guildId, stateType, priority, userId, data);
            return;
        }
        
        console.log(`[StateCoordinator] 🔄 State change: ${stateType} for guild ${guildId}`);
        
        // Lock the new state
        StateLockManager.lockState(guildId, stateType, priority, userId);
        
        // Update tracked state based on state type
        if (stateType === 'idle') {
            // Clear tracked state for idle (no song data)
            this.trackState(guildId, 'idle', null);
        } else if (stateType === 'playing' && data.songData) {
            // Track playing state with song data
            this.trackState(guildId, 'playing', data.songData);
        } else if (stateType === 'loading' && data.songData) {
            // Track loading state with song data
            this.trackState(guildId, 'loading', data.songData);
        } else if (stateType === 'querying' && data.queryData) {
            // Track querying state with query data
            this.trackState(guildId, 'querying', data.queryData);
        }
        
        const listeners = this.stateListeners.get(guildId) || [];
        console.log(`[StateCoordinator] 📡 Notifying ${listeners.length} listeners for guild ${guildId}`);
        
        for (const listener of listeners) {
            try {
                await listener(stateType, data);
            } catch (error) {
                console.error(`[StateCoordinator] Error in state listener:`, error);
            }
        }
        
        // Also trigger embed update service directly
        try {
            const { EmbedUpdateService } = await import('./embed-update-service.js');
            await EmbedUpdateService.handleStateChange(guildId, stateType, data);
            console.log(`[StateCoordinator] ✅ EmbedUpdateService notified for ${stateType} state`);
        } catch (error) {
            console.error(`[StateCoordinator] Error notifying EmbedUpdateService:`, error);
        }
    }

    /**
     * Queue an embed update to prevent spam
     */
    static queueEmbedUpdate(guildId, updateFunction, priority = 'normal') {
        if (!this.embedUpdateQueue.has(guildId)) {
            this.embedUpdateQueue.set(guildId, []);
        }

        const queue = this.embedUpdateQueue.get(guildId);
        const update = { function: updateFunction, priority, timestamp: Date.now() };
        
        // Add to queue based on priority
        if (priority === 'high') {
            queue.unshift(update);
        } else {
            queue.push(update);
        }

        // Process queue after a short delay to batch updates
        this.scheduleEmbedUpdate(guildId);
    }

    /**
     * Schedule embed update processing
     */
    static scheduleEmbedUpdate(guildId) {
        // Clear existing timeout
        if (this.updateTimeouts.has(guildId)) {
            clearTimeout(this.updateTimeouts.get(guildId));
        }

        // Schedule new update
        const timeout = setTimeout(() => {
            this.processEmbedUpdateQueue(guildId);
        }, 100); // 100ms delay to batch updates

        this.updateTimeouts.set(guildId, timeout);
    }

    /**
     * Process the embed update queue for a guild
     */
    static async processEmbedUpdateQueue(guildId) {
        const queue = this.embedUpdateQueue.get(guildId);
        if (!queue || queue.length === 0) return;

        // Get the most recent update (highest priority)
        const update = queue.pop();
        queue.length = 0; // Clear the queue

        try {
            await update.function();
            console.log(`[StateCoordinator] ✅ Embed updated for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] ❌ Error updating embed for guild ${guildId}:`, error);
        }
    }

    /**
     * Clear embed update queue for a guild
     */
    static clearEmbedUpdateQueue(guildId) {
        this.embedUpdateQueue.delete(guildId);
        if (this.updateTimeouts.has(guildId)) {
            clearTimeout(this.updateTimeouts.get(guildId));
            this.updateTimeouts.delete(guildId);
        }
    }

    /**
     * Check if there's an active loading state for a guild
     */
    static async hasActiveLoading(guildId) {
        try {
            const { playerStateManager } = await import('../utils/core/player-state-manager.js');
            const state = playerStateManager.getState(guildId);
            return state?.isLoading || state?.isStarting || state?.isBuffering || false;
        } catch (error) {
            console.error(`[StateCoordinator] Error checking active loading:`, error);
            return false;
        }
    }

    /**
     * Get loading state for a guild
     */
    static async getLoadingState(guildId) {
        try {
            const { playerStateManager } = await import('../utils/core/player-state-manager.js');
            const state = playerStateManager.getState(guildId);
            return {
                isLoading: state?.isLoading || false,
                isStarting: state?.isStarting || false,
                isBuffering: state?.isBuffering || false,
                loadingGif: null // Will be handled by the state classes
            };
        } catch (error) {
            console.error(`[StateCoordinator] Error getting loading state:`, error);
            return null;
        }
    }

    /**
     * Track the current state for a guild
     */
    static trackState(guildId, stateType, songData) {
        try {
            // Store the current state
            if (!this.stateTracker) {
                this.stateTracker = new Map();
            }
            
            this.stateTracker.set(guildId, {
                currentState: stateType,
                songData,
                timestamp: Date.now()
            });
            
            console.log(`[StateCoordinator] 📊 Tracked state: ${stateType} for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error tracking state:`, error);
        }
    }

    /**
     * Get the next state in the sequence flow
     */
    static getNextState(currentState, songData) {
        try {
            switch (currentState) {
                case 'querying':
                    // Querying → Loading (when metadata is received)
                    return 'loading';
                case 'loading':
                    // Loading → Playing (when song starts)
                    return 'playing';
                case 'playing':
                    // Playing → Idle (when song ends)
                    return 'idle';
                default:
                    return 'unknown';
            }
        } catch (error) {
            console.error(`[StateCoordinator] Error getting next state:`, error);
            return 'unknown';
        }
    }

    /**
     * Set querying state (data-driven - triggered when modal is submitted)
     */
    static async setQueryingState(guildId, queryData, userId = null) {
        try {
            console.log(`[StateCoordinator] 🔍 setQueryingState called for guild ${guildId}, queryData:`, queryData);
            
            // Check if we should skip querying state if already playing
            const currentState = this.getCurrentTrackedState(guildId);
            if (currentState?.currentState === 'playing') {
                console.log(`[StateCoordinator] 🚫 Skipping querying state - already playing, song will be queued`);
                return;
            }
            
            // Track the querying state
            this.trackState(guildId, 'querying', queryData);

            // Get user priority level
            const { StateLockManager } = await import('./state-lock-manager.js');
            const priority = StateLockManager.getUserPriority(userId, guildId);

            // Notify state change with priority
            await this.notifyStateChange(guildId, 'querying', {
                queryData,
                timestamp: Date.now()
            }, priority, userId);

            console.log(`[StateCoordinator] 🔄 querying state set for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error setting querying state:`, error);
        }
    }

    /**
     * Set loading state (data-driven - triggered when ytdlp gets song object)
     */
    static async setLoadingState(guildId, songData) {
        try {
            console.log(`[StateCoordinator] 🔍 setLoadingState called for guild ${guildId}, songData:`, songData);
            console.log(`[StateCoordinator] 🔍 SongData properties:`, {
                title: songData?.title,
                source: songData?.source,
                isSpotify: songData?.isSpotify,
                thumbnail: songData?.thumbnail
            });
            
            // Track the loading state
            this.trackState(guildId, 'loading', songData);

            // Notify state change
            await this.notifyStateChange(guildId, 'loading', {
                songData,
                timestamp: Date.now()
            });

            console.log(`[StateCoordinator] 🔄 loading state set for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error setting loading state:`, error);
        }
    }

    /**
     * Set idle state (when song finishes or no music is playing)
     */
    static async setIdleState(guildId) {
        try {
            console.log(`[StateCoordinator] 🔍 setIdleState called for guild ${guildId}`);
            
            // Clear tracked state (no song data for idle)
            this.trackState(guildId, 'idle', null);

            // Notify state change
            await this.notifyStateChange(guildId, 'idle', {
                timestamp: Date.now()
            });

            // Unlock state when going to idle (allows new songs to start)
            const { StateLockManager } = await import('./state-lock-manager.js');
            StateLockManager.unlockState(guildId);

            console.log(`[StateCoordinator] 🔄 idle state set for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error setting idle state:`, error);
        }
    }

    /**
     * Handle idle state transition from PlayerStateManager
     */
    static async handleIdleTransition(guildId) {
        try {
            console.log(`[StateCoordinator] 🔍 handleIdleTransition called for guild ${guildId}`);
            
            // Clear tracked state (no song data for idle)
            this.trackState(guildId, 'idle', null);

            // Notify state change
            await this.notifyStateChange(guildId, 'idle', {
                timestamp: Date.now()
            });

            console.log(`[StateCoordinator] 🔄 idle transition handled for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error handling idle transition:`, error);
        }
    }

    /**
     * Update playing state and notify listeners
     */
    static async setPlayingState(guildId, isPlaying, songData = null) {
        try {
            const { playerStateManager } = await import('../utils/core/player-state-manager.js');
            
            if (isPlaying) {
                playerStateManager.updateState(guildId, {
                    discordStatus: 'playing',
                    isPlaying: true,
                    isPaused: false,
                    isStarting: false,
                    isBuffering: false,
                    lastStateChange: Date.now(),
                    lastActivity: Date.now()
                });
                
                // Track the playing state
                this.trackState(guildId, 'playing', songData);
                
                // Get next state in sequence
                const nextState = this.getNextState('playing', songData);
                console.log(`[StateCoordinator] 🔄 Current: playing, Next: ${nextState}`);
            }

            // Notify state change
            await this.notifyStateChange(guildId, 'playing', {
                isPlaying,
                songData,
                timestamp: Date.now()
            });

            console.log(`[StateCoordinator] 🔄 Playing state: ${isPlaying} for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error setting playing state:`, error);
        }
    }

    /**
     * Update queue state and notify listeners
     */
    static async setQueueState(guildId, queueData) {
        try {
            // Notify state change
            await this.notifyStateChange(guildId, 'queue', {
                queueData,
                timestamp: Date.now()
            });

            console.log(`[StateCoordinator] 🔄 Queue updated for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error setting queue state:`, error);
        }
    }

    /**
     * Update database and trigger UI updates
     */
    static async updateDatabaseAndUI(guildId, databaseUpdate, uiUpdate) {
        try {
            // Update database
            await databaseUpdate();

            // Trigger UI update
            await this.queueEmbedUpdate(guildId, uiUpdate, 'high');

            console.log(`[StateCoordinator] 🔄 Database and UI updated for guild ${guildId}`);
        } catch (error) {
            console.error(`[StateCoordinator] Error updating database and UI:`, error);
        }
    }

    /**
     * Get current state for a guild
     */
    static async getGuildState(guildId) {
        try {
            const { playerStateManager } = await import('../utils/core/player-state-manager.js');
            const { guildAudioSessions } = await import('../utils/core/audio-state.js');
            
            const playerState = playerStateManager.getState(guildId);
            const session = guildAudioSessions.get(guildId);

            return {
                playerState,
                session,
                hasActiveSession: !!session,
                isPlaying: playerState?.isPlaying || false,
                isLoading: playerState?.isStarting || false,
                currentSong: session?.nowPlaying || null,
                queueLength: session?.queue?.length || 0
            };
        } catch (error) {
            console.error(`[StateCoordinator] Error getting guild state:`, error);
            return null;
        }
    }

    /**
     * Get current tracked state for a guild
     */
    static getCurrentTrackedState(guildId) {
        if (!this.stateTracker) {
            return null;
        }
        return this.stateTracker.get(guildId) || null;
    }
}
