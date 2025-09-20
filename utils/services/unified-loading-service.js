// utils/unified-loading-service.js
// Unified loading system that shows a consistent loading GIF and replaces it with song metadata

import { playerStateManager } from '../core/player-state-manager.js';
import { stateFactory } from '../../states/index.js';

/**
 * Unified Loading Service
 * 
 * This service provides the loading sequence logic for all song processing:
 * 1. Manages the loading sequence logic (querying → loading → playing)
 * 2. Handles the technical implementation of loading states
 * 3. Provides loading sequence logic without managing state or flow
 */

// Import dedicated loading GIFs (separate from main screen GIFs)
import { getRandomLoadingGif } from '../constants/loading-gifs.js';

class UnifiedLoadingService {
    constructor() {
        this.activeLoadings = new Map(); // guildId -> loading state
        this.loadingSequences = new Map(); // guildId -> loading sequence logic
    }

    /**
     * Start loading sequence logic - initialize the loading process
     */
    async startLoadingSequence(guildId, searchQuery) {
        console.log(`[UnifiedLoading] Starting loading sequence logic for guild ${guildId}, query: "${searchQuery}"`);
        
        // Initialize loading sequence state
        const loadingSequence = {
            guildId,
            searchQuery,
            startTime: Date.now(),
            currentPhase: 'querying',
            phases: ['querying', 'loading', 'playing']
        };
        
        // Store the loading sequence
        this.loadingSequences.set(guildId, loadingSequence);
        
        // Execute querying phase logic
        await this.executeQueryingPhase(guildId, searchQuery);
        
        console.log(`[UnifiedLoading] ✅ Loading sequence logic started for guild ${guildId}`);
        return loadingSequence;
    }

    /**
     * Execute querying phase logic
     */
    async executeQueryingPhase(guildId, searchQuery) {
        console.log(`[UnifiedLoading] Executing querying phase logic for guild ${guildId}`);
        
        // Querying phase logic: prepare for search
        const sequence = this.loadingSequences.get(guildId);
        if (sequence) {
            sequence.currentPhase = 'querying';
            sequence.queryingStartTime = Date.now();
        }
        
        // Return querying phase data
        return {
            phase: 'querying',
            searchQuery,
            startTime: Date.now()
        };
    }

    /**
     * Execute loading phase logic
     */
    async executeLoadingPhase(guildId, songMetadata) {
        console.log(`[UnifiedLoading] Executing loading phase logic for guild ${guildId}`);
        
        // Loading phase logic: prepare for playback
        const sequence = this.loadingSequences.get(guildId);
        if (sequence) {
            sequence.currentPhase = 'loading';
            sequence.loadingStartTime = Date.now();
            sequence.songMetadata = songMetadata;
        }
        
        // Return loading phase data
        return {
            phase: 'loading',
            songMetadata,
            startTime: Date.now()
        };
    }

    /**
     * Execute playing phase logic
     */
    async executePlayingPhase(guildId, songData) {
        console.log(`[UnifiedLoading] Executing playing phase logic for guild ${guildId}`);
        
        // Playing phase logic: finalize the sequence
        const sequence = this.loadingSequences.get(guildId);
        if (sequence) {
            sequence.currentPhase = 'playing';
            sequence.playingStartTime = Date.now();
            sequence.songData = songData;
        }
        
        // Return playing phase data
        return {
            phase: 'playing',
            songData,
            startTime: Date.now()
        };
    }

    /**
     * Start unified loading - show loading GIF immediately
     */
    async startLoading(guildId, interactionDetails, searchQuery) {
        console.log(`[UnifiedLoading] Starting loading for guild ${guildId}, query: "${searchQuery}"`);
        
        // Check if there's already an active loading for this guild
        const existingLoading = this.activeLoadings.get(guildId);
        
        // Store loading state - reuse existing GIF if available, otherwise generate new one
        const loadingGif = existingLoading?.loadingGif || this.getRandomLoadingGif();
        if (existingLoading?.loadingGif) {
            console.log(`[UnifiedLoading] Reusing existing loading GIF for guild ${guildId}`);
        } else {
            console.log(`[UnifiedLoading] Generated new loading GIF for guild ${guildId}`);
        }
        
        this.activeLoadings.set(guildId, {
            interactionDetails,
            searchQuery,
            startTime: existingLoading?.startTime || Date.now(),
            loadingGif: loadingGif
        });

        // Show loading GIF immediately
        await this.showLoadingGif(guildId, searchQuery);
        
        return true;
    }

    /**
     * Show yellow loading state - metadata found, processing audio
     * This sets the session state so the playback controls system automatically shows yellow loading
     */
    async showYellowLoading(guildId, songMetadata) {
        const loadingState = this.activeLoadings.get(guildId);
        if (!loadingState) {
            console.log(`[UnifiedLoading] No active loading found for guild ${guildId}`);
            return false;
        }

        console.log(`[UnifiedLoading] Showing yellow loading for guild ${guildId}, song: "${songMetadata.title}"`);
        
        try {
            // Set the session state so playback controls system shows yellow loading automatically
            const { guildAudioSessions } = await import('../../utils/core/audio-state.js');
            const session = guildAudioSessions.get(guildId);
            
            if (session) {
                // Set loading state - this will make playback controls show yellow loading
                const { playerStateManager } = await import('../../utils/core/player-state-manager.js');
                playerStateManager.setLoading(guildId, true);
                session.lastStartingTime = Date.now();
                
                // Store song metadata in session for display
                session.currentlyProcessingSong = {
                    title: songMetadata.title,
                    artist: songMetadata.artist,
                    duration: songMetadata.duration,
                    thumbnailUrl: songMetadata.thumbnail,
                    addedBy: songMetadata.addedBy
                };
                
                // Update loading state to track that we've shown yellow loading
                loadingState.yellowLoadingShown = true;
                
                // Trigger playback controls update to show yellow loading immediately
                try {
                    const { updatePlaybackControlsEmbed } = await import('../../message/update-handlers.js');
                    const { client } = await import('../../bot.js');
                    await updatePlaybackControlsEmbed(guildId, client, session);
                } catch (updateError) {
                    console.log(`[UnifiedLoading] Playback controls update error:`, updateError.message);
                }
                
                console.log(`[UnifiedLoading] ✅ Yellow loading state set for guild ${guildId} - playback controls will show it automatically`);
                return true;
            } else {
                console.warn(`[UnifiedLoading] No session found for guild ${guildId} during yellow loading`);
                return false;
            }
        } catch (error) {
            console.error(`[UnifiedLoading] Failed to show yellow loading for guild ${guildId}:`, error.message);
            return false;
        }
    }

    /**
     * Complete loading - transition to green playback controls
     */
    async completeLoading(guildId, songMetadata) {
        const loadingState = this.activeLoadings.get(guildId);
        if (!loadingState) {
            console.log(`[UnifiedLoading] No active loading found for guild ${guildId}`);
            return false;
        }

        console.log(`[UnifiedLoading] Completing loading for guild ${guildId}, song: "${songMetadata.title}"`);
        
        // Clear loading state
        this.activeLoadings.delete(guildId);
        
        // Set loading to false and trigger playing state
        try {
            const { playerStateManager } = await import('../../utils/core/player-state-manager.js');
            playerStateManager.setLoading(guildId, false);
            
            // Trigger playing state change
            const { StateCoordinator } = await import('../../services/state-coordinator.js');
            await StateCoordinator.setPlayingState(guildId, true, songMetadata);
            
            console.log(`[UnifiedLoading] ✅ Loading completed and playing state triggered for guild ${guildId}`);
        } catch (stateError) {
            console.error(`[UnifiedLoading] Error setting playing state:`, stateError.message);
        }
        
        return true;
    }

    /**
     * Handle loading error
     */
    async handleError(guildId, errorMessage) {
        const loadingState = this.activeLoadings.get(guildId);
        if (!loadingState) {
            console.log(`[UnifiedLoading] No active loading found for guild ${guildId}`);
            return false;
        }

        console.log(`[UnifiedLoading] Handling error for guild ${guildId}: ${errorMessage}`);
        
        // Show error message
        await this.showErrorMessage(guildId, errorMessage);
        
        // Clear loading state
        this.activeLoadings.delete(guildId);
        
        return true;
    }

    /**
     * Show loading state using the loading state system
     */
    async showLoadingGif(guildId, searchQuery) {
        const loadingState = this.activeLoadings.get(guildId);
        if (!loadingState) return false;

        // Check if we've already shown this loading state to avoid unnecessary updates
        if (loadingState.lastShownQuery === searchQuery && loadingState.lastShownGif === loadingState.loadingGif) {
            console.log(`[UnifiedLoading] Skipping duplicate loading display for guild ${guildId} - already showing same state`);
            return true;
        }
        
        try {
            // DIRECT APPROACH: Update the playback controls message directly with blue loading
            const { MessageReferenceManager, MESSAGE_TYPES } = await import('../../message/reference-managers.js');
            const { client } = await import('../../bot.js');
            
            // Get the stored playback controls message reference
            const messageRef = await MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
            
            if (messageRef?.messageId && messageRef?.channelId) {
                console.log(`[UnifiedLoading] Found playback controls message, updating with blue loading GIF`);
                
                // Create blue loading embed
                const embed = {
                    color: 0x506098, // Blue color
                    title: '🔍 Searching for Music...',
                    description: `**Searching:** \`${searchQuery}\`\n\nPlease wait while I find your music...`,
                    image: {
                        url: loadingState.loadingGif
                    },
                    footer: {
                        text: 'This may take a few moments...'
                    }
                };
                
                // Update the message directly
                const channel = await client.channels.fetch(messageRef.channelId);
                const message = await channel.messages.fetch(messageRef.messageId);
                await message.edit({ embeds: [embed] });
                
                console.log(`[UnifiedLoading] ✅ Blue loading GIF shown on playback controls for guild ${guildId}`);
            } else {
                console.log(`[UnifiedLoading] No playback controls message found, trying direct message`);
                await this.sendDirectLoadingMessage(guildId, searchQuery, loadingState);
            }
            
            // Update the last shown state to prevent duplicate updates
            loadingState.lastShownQuery = searchQuery;
            loadingState.lastShownGif = loadingState.loadingGif;
            
            return true;
        } catch (error) {
            console.error(`[UnifiedLoading] Failed to show loading state for guild ${guildId}:`, error.message);
            return false;
        }
    }

    /**
     * Send loading message directly when no session exists
     */
    async sendDirectLoadingMessage(guildId, searchQuery, loadingState) {
        try {
            const embed = {
                color: 0xFFA500, // Orange for loading
                title: 'Loading Music...',
                description: `**Loading:** \`${searchQuery}\`\n\nPlease wait while I find and prepare your music...`,
                image: {
                    url: loadingState.loadingGif
                },
                footer: {
                    text: 'This may take a few seconds...'
                },
                timestamp: new Date().toISOString()
            };

            await this.updateMessage(loadingState.interactionDetails, embed, guildId);
            console.log(`[UnifiedLoading] ✅ Direct loading message sent for guild ${guildId}`);
        } catch (error) {
            console.error(`[UnifiedLoading] Failed to send direct loading message for guild ${guildId}:`, error.message);
        }
    }



    /**
     * Show error message
     */
    async showErrorMessage(guildId, errorMessage) {
        const loadingState = this.activeLoadings.get(guildId);
        if (!loadingState) return false;

        const { interactionDetails } = loadingState;
        
        try {
            const embed = {
                color: 0xff0000, // Red for error
                title: 'Loading Failed',
                description: `**Error:** ${errorMessage}\n\nPlease try again with a different search term.`,
                footer: {
                    text: 'If this persists, the song may not be available.'
                },
                timestamp: new Date().toISOString()
            };

            await this.updateMessage(interactionDetails, embed, guildId);
            console.log(`[UnifiedLoading] ✅ Error message shown for guild ${guildId}`);
            return true;
        } catch (error) {
            console.error(`[UnifiedLoading] Failed to show error message for guild ${guildId}:`, error.message);
            return false;
        }
    }

    /**
     * Update Discord message - handles both real interactions and queue progression
     */
    async updateMessage(interactionDetails, embed, guildId = null) {
        const { applicationId, interactionToken } = interactionDetails;
        
        console.log(`[UnifiedLoading] updateMessage called with applicationId: ${applicationId}, interactionToken: ${interactionToken}, guildId: ${guildId}`);
        
        // FIRST: Check if we have a stored message reference for this guild
        if (guildId) {
            try {
                const { MessageReferenceManager, MESSAGE_TYPES } = await import('../../message/reference-managers.js');
                const messageRef = MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.LOADING_MESSAGE);
                
                if (messageRef?.messageId && messageRef?.channelId) {
                    console.log(`[UnifiedLoading] Found stored message reference, updating message ${messageRef.messageId} instead of webhook`);
                    
                    // Use the stored message reference instead of webhook
                    const { ClientService } = await import('../client-service.js');
                    const client = ClientService.getClient();
                    const channel = await client.channels.fetch(messageRef.channelId);
                    const message = await channel.messages.fetch(messageRef.messageId);
                    
                    await message.edit({ embeds: [embed] });
                    console.log(`[UnifiedLoading] ✅ Updated stored message ${messageRef.messageId} for guild ${guildId}`);
                    return { success: true };
                }
            } catch (error) {
                console.log(`[UnifiedLoading] No stored message reference found, falling back to webhook:`, error.message);
            }
        }
        
        // Check if this is queue progression (fake interaction details)
        if (applicationId === 'queue-progression' || interactionToken === 'queue-progression') {
            console.log(`[UnifiedLoading] Queue progression detected - updating playback controls instead of webhook`);
            
            // For queue progression, update the playback controls embed instead
            try {
                const { updatePlaybackControlsEmbed } = await import('../../message/update-handlers.js');
                const { guildAudioSessions } = await import('../../utils/core/audio-state.js');
                const session = guildAudioSessions.get(guildId);
                
                if (session) {
                    console.log(`[UnifiedLoading] 🔍 Session found for guild ${guildId}, setting loading state`);
                    
                    // Set the loading state using playerStateManager
                    try {
                        playerStateManager.setLoading(guildId, true);
                        session.lastStartingTime = Date.now();
                        
                        // Get current UI state for debugging
                        const uiState = playerStateManager.getCurrentUIState(guildId);
                        console.log(`[UnifiedLoading] 🔍 Using UI state: ${uiState.name} for guild ${guildId}`);
                        
                        console.log(`[UnifiedLoading] 🔍 Session state after setting loading:`, {
                            isStarting: session.isStarting,
                            hasQueue: !!session.queue,
                            queueLength: session.queue?.length || 0,
                            hasNowPlaying: !!session.nowPlaying,
                            uiState: uiState.name
                        });
                        
                        // Send initial playback controls message if none exists, then update it
                        const { MessageReferenceManager, MESSAGE_TYPES } = await import('../../message/reference-managers.js');
                        let messageRef = MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
                        
                        if (!messageRef) {
                            console.log(`[UnifiedLoading] No playback controls message found, sending initial message for guild ${guildId}`);
                            
                            // Get the channel where the bot is connected
                            const channelId = session.connection.joinConfig.channelId;
                            const { client } = await import('../../bot.js');
                            const guild = await client.guilds.fetch(guildId);
                            const textChannel = await guild.channels.fetch(channelId);
                            
                            // Use new message system
                            const { updatePlaybackControlsEmbed } = await import('../../message/update-handlers.js');
                            await updatePlaybackControlsEmbed(guildId, client);
                            
                            console.log(`[UnifiedLoading] ✅ Sent and stored initial playback controls message for guild ${guildId}`);
                        }
                        
                        // Now update the message with loading state
                        console.log(`[UnifiedLoading] 🔍 Calling updatePlaybackControlsEmbed...`);
                        const { client } = await import('../../bot.js');
                        await updatePlaybackControlsEmbed(guildId, client, session);
                        console.log(`[UnifiedLoading] ✅ Updated playback controls for queue progression`);
                        return { success: true };
                    } catch (stateError) {
                        console.error(`[UnifiedLoading] Failed to set isStarting state:`, stateError.message);
                        return { success: false };
                    }
                } else {
                    console.warn(`[UnifiedLoading] No session found for guild ${guildId} during queue progression`);
                    return { success: false };
                }
            } catch (error) {
                console.error(`[UnifiedLoading] Failed to update playback controls for queue progression:`, error.message);
                throw error;
            }
        }
        
        // For real interactions, use webhook updates (this is correct for modal responses)
        try {
            const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 404 && errorText.includes('Unknown Webhook')) {
                    console.log(`[UnifiedLoading] ⚠️ Webhook expired (404), this is normal for old interactions - skipping update`);
                    return { success: true }; // Don't treat this as an error
                }
                throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            
            // Store the message reference using MessageReferenceManager for future updates
            if (guildId) {
                try {
                    const { MessageReferenceManager, MESSAGE_TYPES } = await import('../../message/reference-managers.js');
                    MessageReferenceManager.storeMessageRef(guildId, MESSAGE_TYPES.LOADING_MESSAGE, result.id, result.channel_id);
                    console.log(`[UnifiedLoading] Stored loading message reference: ${result.id}`);
                } catch (dbError) {
                    console.warn(`[UnifiedLoading] Failed to store message reference:`, dbError.message);
                }
            }

            return result;
        } catch (error) {
            console.error(`[UnifiedLoading] Failed to update Discord message:`, error.message);
            throw error;
        }
    }

    /**
     * Get random loading GIF (dedicated loading GIFs only)
     */
    getRandomLoadingGif() {
        return getRandomLoadingGif();
    }

    /**
     * Check if guild has active loading
     */
    hasActiveLoading(guildId) {
        return this.activeLoadings.has(guildId);
    }

    /**
     * Get loading state for guild
     */
    getLoadingState(guildId) {
        return this.activeLoadings.get(guildId);
    }

    /**
     * Clean up loading state for a guild (for comprehensive cleanup)
     */
    cleanupGuildLoadingState(guildId) {
        if (this.activeLoadings.has(guildId)) {
            console.log(`[UnifiedLoading] 🧹 Cleaning up loading state for guild ${guildId}`);
            this.activeLoadings.delete(guildId);
            return true;
        }
        return false;
    }

    /**
     * Clean up old loading states (prevent stuck loading states)
     */
    cleanupOldLoadingStates() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes max
        let cleaned = 0;

        for (const [guildId, loadingState] of this.activeLoadings) {
            if (now - loadingState.startTime > maxAge) {
                console.log(`[UnifiedLoading] 🧹 Cleaning up stuck loading state for guild ${guildId} (age: ${Math.round((now - loadingState.startTime) / 1000)}s)`);
                this.activeLoadings.delete(guildId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[UnifiedLoading] ✅ Cleaned up ${cleaned} stuck loading states`);
        }

        return cleaned;
    }
}

// Export singleton instance
export const unifiedLoadingService = new UnifiedLoadingService();

// Convenience functions
export async function startUnifiedLoading(guildId, interactionDetails, searchQuery) {
    return await unifiedLoadingService.startLoading(guildId, interactionDetails, searchQuery);
}

export async function showYellowLoading(guildId, songMetadata) {
    return await unifiedLoadingService.showYellowLoading(guildId, songMetadata);
}

export async function completeUnifiedLoading(guildId, songMetadata) {
    return await unifiedLoadingService.completeLoading(guildId, songMetadata);
}

export async function handleUnifiedLoadingError(guildId, errorMessage) {
    return await unifiedLoadingService.handleError(guildId, errorMessage);
}
