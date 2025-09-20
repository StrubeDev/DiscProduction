import { BaseState } from './base-state.js';
import { PlayingState } from './playing-state.js';
import { PausedState } from './paused-state.js';
import { BufferingState } from './buffering-state.js';
import { LoadingState } from './loading-state.js';
import { QueryingState } from './querying-state.js';
import { IdleState } from './idle-state.js';
import { ErrorState } from './error-state.js';

/**
 * State Registry
 * Manages all available UI states
 */
class StateRegistry {
    constructor() {
        this.stateClasses = new Map();
        this.stateInstances = new Map();
        this.registerDefaultStateClasses();
    }

    /**
     * Register default state classes (lazy loading)
     */
    registerDefaultStateClasses() {
        this.stateClasses.set('playing', PlayingState);
        this.stateClasses.set('paused', PausedState);
        this.stateClasses.set('buffering', BufferingState);
        this.stateClasses.set('loading', LoadingState);
        this.stateClasses.set('querying', QueryingState);
        this.stateClasses.set('idle', IdleState);
        this.stateClasses.set('error', ErrorState);
    }

    /**
     * Register a new state class
     */
    register(name, StateClass) {
        if (typeof StateClass !== 'function') {
            throw new Error('State must be a class constructor');
        }
        
        this.stateClasses.set(name, StateClass);
        console.log(`[StateRegistry] Registered state class: ${name}`);
    }

    /**
     * Get a state by name (lazy instantiation)
     */
    get(name) {
        // Check if we already have an instance
        if (this.stateInstances.has(name)) {
            return this.stateInstances.get(name);
        }

        // Get the class and create instance
        const StateClass = this.stateClasses.get(name);
        if (!StateClass) {
            console.warn(`[StateRegistry] State '${name}' not found, using idle state`);
            return this.get('idle');
        }

        // Create and cache the instance
        const instance = new StateClass();
        this.stateInstances.set(name, instance);
        return instance;
    }

    /**
     * Get all registered states (lazy instantiation)
     */
    getAll() {
        const instances = [];
        for (const name of this.stateClasses.keys()) {
            instances.push(this.get(name));
        }
        return instances;
    }

    /**
     * Get state names
     */
    getStateNames() {
        return Array.from(this.stateClasses.keys());
    }

    /**
     * Check if a state exists
     */
    has(name) {
        return this.stateClasses.has(name);
    }
}

/**
 * State Factory
 * Creates and manages state instances
 */
class StateFactory {
    constructor() {
        this.registry = new StateRegistry();
    }

    /**
     * Get a state for a specific Discord player status
     */
    getStateForDiscordStatus(discordStatus, isStarting = false) {
        // Handle custom loading state
        if (isStarting) {
            return this.registry.get('loading');
        }

        // Map Discord status to our states
        const statusMap = {
            'playing': 'playing',
            'paused': 'paused',
            'buffering': 'buffering',
            'idle': 'idle'
        };

        const stateName = statusMap[discordStatus] || 'idle';
        return this.registry.get(stateName);
    }

    /**
     * Get a state by name
     */
    getState(name) {
        return this.registry.get(name);
    }

    /**
     * Get all available states
     */
    getAllStates() {
        return this.registry.getAll();
    }

    /**
     * Register a custom state
     */
    registerState(name, state) {
        this.registry.register(name, state);
    }

    /**
     * Get state summary for debugging
     */
    getStateSummary() {
        const states = this.registry.getAll();
        return states.map(state => state.getSummary());
    }
}

// Export singleton instance
export const stateFactory = new StateFactory();

// Export individual state classes for custom implementations
export {
    BaseState,
    PlayingState,
    PausedState,
    BufferingState,
    LoadingState,
    IdleState,
    ErrorState
};
