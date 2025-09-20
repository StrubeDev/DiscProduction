// utils/core/player-state-manager.js
import { AudioPlayerStatus } from '@discordjs/voice';
import { guildAudioSessions } from './audio-state.js';
import { stateFactory } from '../../states/index.js';

/**
 * Centralized Player State Manager
 * Single source of truth for all player state management
 * Listens to Discord events instead of guessing
 */
class PlayerStateManager {
    constructor() {
        this.guildStates = new Map(); // guildId -> state object
        this.stateListeners = new Map(); // guildId -> Set of listeners
    }

    /**
     * Initialize state for a guild
     */
    initializeGuildState(guildId, player) {
        const state = {
            // Discord player state (source of truth)
            discordStatus: 'idle',
            
            // Session state (derived from Discord state)
            isPlaying: false,
            isPaused: false,
            isStarting: false,
            isBuffering: false,
            
            // Song state
            nowPlaying: null,
            currentSong: null,
            hasNowPlaying: false,
            
            // Timestamps
            lastStateChange: Date.now(),
            lastActivity: Date.now(),
            
            // Flags
            autoAdvanceQueue: true,
            eventListenersAttached: false
        };

        this.guildStates.set(guildId, state);
        this.attachStateListeners(guildId, player);
        
        console.log(`[PlayerStateManager] ✅ Initialized state for guild ${guildId}`);
        return state;
    }

    /**
     * Attach event listeners to Discord player
     */
    attachStateListeners(guildId, player) {
        const state = this.guildStates.get(guildId);
        if (!state || state.eventListenersAttached) {
            return;
        }

        console.log(`[PlayerStateManager] 🎧 Attaching state listeners for guild ${guildId}`);

        // Playing event
        player.on(AudioPlayerStatus.Playing, () => {
            this.updateState(guildId, {
                discordStatus: 'playing',
                isPlaying: true,
                isPaused: false,
                isStarting: false,
                isBuffering: false,
                lastStateChange: Date.now(),
                lastActivity: Date.now()
            });
            // Reduced logging - only log in debug mode
            // console.log(`[PlayerStateManager] ▶️ PLAYING: Guild ${guildId}`);
        });

        // Paused event
        player.on(AudioPlayerStatus.Paused, () => {
            this.updateState(guildId, {
                discordStatus: 'paused',
                isPlaying: false,
                isPaused: true,
                isStarting: false,
                isBuffering: false,
                lastStateChange: Date.now(),
                lastActivity: Date.now()
            });
            // Reduced logging - only log in debug mode
            // console.log(`[PlayerStateManager] ⏸️ PAUSED: Guild ${guildId}`);
        });

        // Idle event
        player.on(AudioPlayerStatus.Idle, async () => {
            this.updateState(guildId, {
                discordStatus: 'idle',
                isPlaying: false,
                isPaused: false,
                isStarting: false,
                isBuffering: false,
                nowPlaying: null,
                currentSong: null,
                lastStateChange: Date.now(),
                lastActivity: Date.now()
            });
            console.log(`[PlayerStateManager] ⏹️ IDLE: Guild ${guildId}`);
            
            // NOTIFY QUEUE MANAGER: Let QueueManager handle auto-advance
            try {
                const { queueManager } = await import('../services/queue-manager.js');
                await queueManager.handleAutoAdvance(guildId);
            } catch (error) {
                console.error(`[PlayerStateManager] ❌ Auto-advance error:`, error.message);
            }
        });

        // Buffering event
        player.on(AudioPlayerStatus.Buffering, () => {
            this.updateState(guildId, {
                discordStatus: 'buffering',
                isPlaying: false,
                isPaused: false,
                isStarting: false,
                isBuffering: true,
                lastStateChange: Date.now(),
                lastActivity: Date.now()
            });
            // Reduced logging - only log in debug mode
            // console.log(`[PlayerStateManager] 🔄 BUFFERING: Guild ${guildId}`);
        });

        // Error event
        player.on('error', (error) => {
            console.error(`[PlayerStateManager] ❌ ERROR: Guild ${guildId}:`, error);
            this.updateState(guildId, {
                discordStatus: 'idle',
                isPlaying: false,
                isPaused: false,
                isStarting: false,
                isBuffering: false,
                nowPlaying: null,
                currentSong: null,
                lastStateChange: Date.now(),
                lastActivity: Date.now()
            });
        });

        state.eventListenersAttached = true;
        console.log(`[PlayerStateManager] ✅ State listeners attached for guild ${guildId}`);
    }

    /**
     * Update state and notify listeners
     */
    updateState(guildId, updates) {
        const state = this.guildStates.get(guildId);
        if (!state) {
            console.warn(`[PlayerStateManager] ⚠️ No state found for guild ${guildId}`);
            return;
        }

        // Update state
        Object.assign(state, updates);

        // Notify listeners
        const listeners = this.stateListeners.get(guildId);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(state, updates);
                } catch (error) {
                    console.error(`[PlayerStateManager] Error in state listener:`, error);
                }
            });
        }

        // Notify StateCoordinator for embed updates
        this.notifyStateCoordinator(guildId, updates);

        console.log(`[PlayerStateManager] 📊 State updated for guild ${guildId}:`, {
            discordStatus: state.discordStatus,
            isPlaying: state.isPlaying,
            isPaused: state.isPaused,
            isStarting: state.isStarting,
            isBuffering: state.isBuffering,
            hasNowPlaying: !!state.nowPlaying
        });
    }

    /**
     * Notify StateCoordinator of state changes for embed updates
     */
    async notifyStateCoordinator(guildId, updates) {
        try {
            const { StateCoordinator } = await import('../../services/state-coordinator.js');
            
            // Determine state type based on updates
            let stateType = 'unknown';
            if (updates.isQuerying === true) {
                stateType = 'querying';
            } else if (updates.discordStatus === 'playing' && updates.isPlaying === true) {
                stateType = 'playing';
            } else if (updates.discordStatus === 'paused' && updates.isPaused === true) {
                stateType = 'paused';
            } else if (updates.discordStatus === 'idle' && updates.isPlaying === false) {
                stateType = 'idle';
            } else if (updates.isStarting === true || updates.isBuffering === true) {
                stateType = 'loading';
            }
            
            console.log(`[PlayerStateManager] 🔄 Notifying StateCoordinator: ${stateType} for guild ${guildId}`, updates);
            
            if (stateType !== 'unknown') {
                // If going to idle state, unlock first to allow the transition
                if (stateType === 'idle') {
                    const { StateLockManager } = await import('../../services/state-lock-manager.js');
                    StateLockManager.unlockState(guildId);
                }
                
                await StateCoordinator.notifyStateChange(guildId, stateType, updates);
            }
        } catch (error) {
            console.error(`[PlayerStateManager] Error notifying StateCoordinator:`, error);
        }
    }

    /**
     * Set the current song
     */
    setNowPlaying(guildId, song) {
        this.updateState(guildId, {
            nowPlaying: song,
            currentSong: song,
            hasNowPlaying: !!song,
            lastActivity: Date.now()
        });
        
        // Note: session.nowPlaying is a getter that automatically returns the current value from state manager
        
        console.log(`[PlayerStateManager] 🎵 Set now playing: "${song?.title || 'Unknown'}" for guild ${guildId}`);
    }

    /**
     * Clear the current song
     */
    clearNowPlaying(guildId) {
        this.updateState(guildId, {
            nowPlaying: null,
            currentSong: null,
            hasNowPlaying: false,
            lastActivity: Date.now()
        });
        
        // Note: session.nowPlaying is a getter that automatically returns the current value from state manager
        
        console.log(`[PlayerStateManager] 🧹 Cleared now playing for guild ${guildId}`);
    }

    /**
     * Set loading state
     */
    setLoading(guildId, isLoading) {
        this.updateState(guildId, {
            isStarting: isLoading,
            lastActivity: Date.now()
        });
        console.log(`[PlayerStateManager] ${isLoading ? '🔄' : '✅'} Loading state: ${isLoading} for guild ${guildId}`);
    }

    /**
     * Get current state
     */
    getState(guildId) {
        return this.guildStates.get(guildId) || null;
    }

    /**
     * Check if guild can play immediately
     */
    canPlayImmediately(guildId, session = null) {
        const state = this.getState(guildId);
        if (!state) return false;

        // AGGRESSIVE STATE RESET: If player is idle but state shows starting/buffering, reset it
        if (state.discordStatus === 'idle' && (state.isStarting || state.isBuffering)) {
            console.log(`[PlayerStateManager] 🔄 AGGRESSIVE RESET: Player is idle but state shows starting/buffering - resetting state`);
            state.isStarting = false;
            state.isBuffering = false;
            state.isPlaying = false;
            state.isPaused = false;
            state.hasNowPlaying = false;
            state.nowPlaying = null;
            console.log(`[PlayerStateManager] ✅ State reset completed`);
        }

        // Can only play immediately if:
        // 1. Player is idle (not playing anything)
        // 2. Not currently starting or buffering
        // 3. No song is currently playing (check both state and session)
        // 4. NO QUEUE EXISTS (if there's a queue, add to queue instead)
        const isIdle = state.discordStatus === 'idle' && 
                      !state.isStarting && 
                      !state.isBuffering;
        
        // Check both the state and the session for current song
        const noSongInState = !state.hasNowPlaying;
        const noSongInSession = !session?.nowPlaying;
        const noSongPlaying = noSongInState && noSongInSession;
        
        // Check if there's a queue - if there is, don't play immediately
        const hasQueue = session?.queue && session.queue.length > 0;
        
        // FIXED LOGIC: Only play immediately if:
        // 1. Player is idle (not playing anything)
        // 2. No song is currently playing
        // 3. No queue exists (if there's a queue, add to queue instead)
        const canPlay = isIdle && noSongPlaying && !hasQueue;
        
        console.log(`[PlayerStateManager] canPlayImmediately check for guild ${guildId}:`, {
            discordStatus: state.discordStatus,
            isIdle,
            isStarting: state.isStarting,
            isBuffering: state.isBuffering,
            noSongInState,
            noSongInSession,
            noSongPlaying,
            hasNowPlaying: state.hasNowPlaying,
            sessionNowPlaying: !!session?.nowPlaying,
            nowPlayingTitle: state.nowPlaying?.title || session?.nowPlaying?.title || 'None',
            actualPlayerStatus: session?.player?.state?.status || 'no player',
            hasQueue,
            queueLength: session?.queue?.length || 0,
            canPlay
        });
        
        return canPlay;
    }

    /**
     * Check if guild is currently playing
     */
    isPlaying(guildId) {
        const state = this.getState(guildId);
        return state ? state.isPlaying : false;
    }

    /**
     * Check if guild is paused
     */
    isPaused(guildId) {
        const state = this.getState(guildId);
        return state ? state.isPaused : false;
    }

    /**
     * Check if guild is loading/starting
     */
    isStarting(guildId) {
        const state = this.getState(guildId);
        return state ? state.isStarting : false;
    }

    /**
     * Check if guild is buffering
     */
    isBuffering(guildId) {
        const state = this.getState(guildId);
        return state ? state.isBuffering : false;
    }

    /**
     * Get the current song
     */
    getNowPlaying(guildId) {
        const state = this.getState(guildId);
        return state ? state.nowPlaying : null;
    }

    /**
     * Get the current UI state for this guild
     */
    getCurrentUIState(guildId) {
        const state = this.getState(guildId);
        if (!state) return stateFactory.getState('idle');

        // Determine the appropriate state based on current conditions
        if (state.isStarting) {
            return stateFactory.getState('loading');
        } else if (state.isPlaying) {
            return stateFactory.getState('playing');
        } else if (state.isPaused) {
            return stateFactory.getState('paused');
        } else if (state.isBuffering) {
            return stateFactory.getState('buffering');
        } else {
            return stateFactory.getState('idle');
        }
    }

    /**
     * Get state summary for debugging
     */
    getStateSummary(guildId) {
        const state = this.getState(guildId);
        const uiState = this.getCurrentUIState(guildId);
        
        return {
            guildId,
            playerState: state,
            uiState: uiState.getSummary(),
            canPlayImmediately: this.canPlayImmediately(guildId)
        };
    }

    /**
     * Add state change listener
     */
    addStateListener(guildId, listener) {
        if (!this.stateListeners.has(guildId)) {
            this.stateListeners.set(guildId, new Set());
        }
        this.stateListeners.get(guildId).add(listener);
    }

    /**
     * Remove state change listener
     */
    removeStateListener(guildId, listener) {
        const listeners = this.stateListeners.get(guildId);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /**
     * Clean up guild state
     */
    cleanupGuildState(guildId) {
        this.guildStates.delete(guildId);
        this.stateListeners.delete(guildId);
        console.log(`[PlayerStateManager] 🧹 Cleaned up state for guild ${guildId}`);
    }

    /**
     * Get all states (for debugging)
     */
    getAllStates() {
        const states = {};
        for (const [guildId, state] of this.guildStates) {
            states[guildId] = {
                discordStatus: state.discordStatus,
                isPlaying: state.isPlaying,
                isPaused: state.isPaused,
                isStarting: state.isStarting,
                isBuffering: state.isBuffering,
                hasNowPlaying: !!state.nowPlaying,
                lastStateChange: state.lastStateChange,
                lastActivity: state.lastActivity
            };
        }
        return states;
    }
}

export const playerStateManager = new PlayerStateManager();
