/**
 * Embed Update Service
 * Centralized service for updating all embeds based on state changes
 */
import { ClientService } from './client-service.js';
import { StateCoordinator } from './state-coordinator.js';

export class EmbedUpdateService {
    static initialized = false;

    /**
     * Initialize the embed update service
     */
    static async initialize() {
        if (this.initialized) return;

        console.log('[EmbedUpdateService] Initializing embed update service...');

        // Register state listeners for all guilds
        this.setupStateListeners();

        this.initialized = true;
        console.log('[EmbedUpdateService] ✅ Embed update service initialized');
    }

    /**
     * Setup state listeners for embed updates
     */
    static setupStateListeners() {
        // This will be called for each guild when they start playing music
        console.log('[EmbedUpdateService] State listeners ready');
    }

    /**
     * Register state listeners for a specific guild
     */
    static registerGuildListeners(guildId) {
        // Remove existing listeners first
        StateCoordinator.removeStateListeners(guildId);

        // Add new listeners
        StateCoordinator.addStateListener(guildId, async (stateType, data) => {
            await EmbedUpdateService.handleStateChange(guildId, stateType, data);
        });

        console.log(`[EmbedUpdateService] Registered listeners for guild ${guildId}`);
    }

    /**
     * Handle state changes and update embeds accordingly
     */
    static async handleStateChange(guildId, stateType, data) {
        try {
            // Check if client is available before proceeding
            if (!ClientService.isClientAvailable()) {
                console.log(`[EmbedUpdateService] Client not available, skipping ${stateType} update for guild ${guildId}`);
                return;
            }
            
            const client = ClientService.getClient();
            const { guildQueueDisplayPreference } = await import('../utils/queue/display-preferences.js');
            const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';

            console.log(`[EmbedUpdateService] 🔄 Handling ${stateType} for guild ${guildId} (display: ${displayPref})`);

            switch (stateType) {
                case 'querying':
                    await this.updateQueryingState(guildId, client, data);
                    break;
                case 'loading':
                    await this.updateLoadingState(guildId, client, data);
                    break;
                case 'playing':
                    await this.updatePlayingState(guildId, client, data);
                    break;
                case 'paused':
                    await this.updatePausedState(guildId, client, data);
                    break;
                case 'idle':
                    await this.updateIdleState(guildId, client, data);
                    break;
                case 'queue':
                    await this.updateQueueState(guildId, client, data);
                    break;
                default:
                    console.log(`[EmbedUpdateService] Unknown state type: ${stateType}`);
            }
        } catch (error) {
            console.error(`[EmbedUpdateService] Error handling state change:`, error);
        }
    }

    /**
     * Update embed for querying state
     */
    static async updateQueryingState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        
        // Allow querying state updates even without session (session created later)
        await updatePlaybackControlsEmbed(guildId, client, null);
        console.log(`[EmbedUpdateService] ✅ Updated querying state for guild ${guildId}`);
    }

    /**
     * Update embed for loading state
     */
    static async updateLoadingState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        
        // Allow loading state updates even without session (session may not exist yet)
        await updatePlaybackControlsEmbed(guildId, client, null);
        console.log(`[EmbedUpdateService] ✅ Updated loading state for guild ${guildId}`);
    }

    /**
     * Update embed for playing state
     */
    static async updatePlayingState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        const { guildAudioSessions } = await import('../utils/core/audio-state.js');
        
        const session = guildAudioSessions.get(guildId);
        if (session) {
            await updatePlaybackControlsEmbed(guildId, client, session);
            console.log(`[EmbedUpdateService] ✅ Updated playing state for guild ${guildId}`);
        }
    }

    /**
     * Update embed for paused state
     */
    static async updatePausedState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        const { guildAudioSessions } = await import('../utils/core/audio-state.js');
        
        const session = guildAudioSessions.get(guildId);
        if (session) {
            await updatePlaybackControlsEmbed(guildId, client, session);
            console.log(`[EmbedUpdateService] ✅ Updated paused state for guild ${guildId}`);
        }
    }

    /**
     * Update embed for idle state
     */
    static async updateIdleState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        const { guildAudioSessions } = await import('../utils/core/audio-state.js');
        
        const session = guildAudioSessions.get(guildId);
        if (session) {
            await updatePlaybackControlsEmbed(guildId, client, session);
            console.log(`[EmbedUpdateService] ✅ Updated idle state for guild ${guildId}`);
        }
    }

    /**
     * Update embed for queue changes
     */
    static async updateQueueState(guildId, client, data) {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        const { guildAudioSessions } = await import('../utils/core/audio-state.js');
        
        const session = guildAudioSessions.get(guildId);
        if (session) {
            await updatePlaybackControlsEmbed(guildId, client, session);
            console.log(`[EmbedUpdateService] ✅ Updated queue state for guild ${guildId}`);
        }
    }

    /**
     * Force update all embeds for a guild
     */
    static async forceUpdateGuild(guildId) {
        try {
            // Check if client is available before proceeding
            if (!ClientService.isClientAvailable()) {
                console.log(`[EmbedUpdateService] Client not available, skipping force update for guild ${guildId}`);
                return;
            }
            
            const client = ClientService.getClient();
            const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
            const { guildAudioSessions } = await import('../utils/core/audio-state.js');
            
            const session = guildAudioSessions.get(guildId);
            if (session) {
                await updatePlaybackControlsEmbed(guildId, client, session);
                console.log(`[EmbedUpdateService] ✅ Force updated guild ${guildId}`);
            }
        } catch (error) {
            console.error(`[EmbedUpdateService] Error force updating guild ${guildId}:`, error);
        }
    }

    /**
     * Update database and trigger embed update
     */
    static async updateDatabaseAndEmbed(guildId, databaseUpdate) {
        await StateCoordinator.updateDatabaseAndUI(guildId, databaseUpdate, async () => {
            await this.forceUpdateGuild(guildId);
        });
    }
}
