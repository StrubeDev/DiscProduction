/**
 * Loading Page Handler
 * Generates the loading state UI
 */

import { InteractionResponseType } from 'discord-interactions';
import { stateFactory } from '../states/index.js';
import { guildAudioSessions } from '../utils/core/audio-state.js';

/**
 * Handle loading page generation
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function handleLoadingPage(guildId, djsClient, trackedState) {
    const uiState = stateFactory.getState('loading');
    const session = guildAudioSessions.get(guildId);
    const queueLength = session?.queue?.length || 0;
    
    // Use song data from trackedState (StateCoordinator) during loading
    const currentSong = trackedState?.songData;
    if (!currentSong) {
        return {
            embeds: [{
                color: uiState.getEmbedColor(),
                description: "No song data available for loading state."
            }],
            components: []
        };
    }
    
    let musicDisplay = `**${currentSong.title}**`;
    
    // Use image processor to determine what gets shown
    const { imageProcessor } = await import('../utils/processors/image-processor.js');
    const imageUrl = imageProcessor.getDisplayImage(currentSong);
    
    // Debug logging
    console.log(`[LoadingPage] Image URL: ${imageUrl}`);
    console.log(`[LoadingPage] Song source: ${currentSong.source}, isSpotify: ${currentSong.isSpotify}`);
    console.log(`[LoadingPage] Spotify image: ${currentSong.thumbnail}`);
    console.log(`[LoadingPage] YouTube image: ${currentSong.imageUrl}`);
    
    // Don't show queue info during loading - it can be stale
    // Queue info should only be shown in playing state
    
    // Let the state determine the volume and duration display
    const currentTime = 0; // Loading state doesn't have current time
    const volumeLevel = session?.volume || 100;
    const isMuted = session?.isMuted || false;
    const volumeBarCount = Math.ceil(volumeLevel / 10);
    const filledBars = '█'.repeat(volumeBarCount);
    const emptyBars = '░'.repeat(10 - volumeBarCount);
    const volumeBar = isMuted ? '░░░░░░░░░░' : `${filledBars}${emptyBars}`;
    
    return {
        embeds: [{
            color: uiState.getEmbedColor(),
            description: musicDisplay,
            image: imageUrl ? { url: imageUrl } : undefined,
            fields: [
                {
                    name: '',
                    value: (() => {
                        if (!currentSong.duration || currentSong.duration <= 0) {
                            return `\`Unknown\``;
                        }
                        // Convert milliseconds to seconds
                        const durationSeconds = Math.floor(currentSong.duration / 1000);
                        // Handle unusually long durations (more than 10 hours)
                        if (durationSeconds > 36000) {
                            return `\`${Math.floor(durationSeconds / 3600)}:${Math.floor((durationSeconds % 3600) / 60).toString().padStart(2, '0')}:${(durationSeconds % 60).toString().padStart(2, '0')}\``;
                        }
                        return `\`${Math.floor(durationSeconds / 60) + ':' + (durationSeconds % 60).toString().padStart(2, '0')}\``;
                    })(),
                    inline: true
                },
                {
                    name: '',
                    value: isMuted ? '🔇 **MUTED**' : `\`${volumeLevel}%\` ${volumeBar}`,
                    inline: true
                }
            ]
        }],
        components: [] // Buttons are handled by content generator
    };
}
