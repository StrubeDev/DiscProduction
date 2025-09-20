/**
 * Playing Page Handler
 * Generates the playing state UI
 */

import { InteractionResponseType } from 'discord-interactions';
import { stateFactory } from '../states/index.js';
import { guildAudioSessions } from '../utils/core/audio-state.js';

/**
 * Handle playing page generation
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function handlePlayingPage(guildId, djsClient, trackedState) {
    const uiState = stateFactory.getState('playing');
    const session = guildAudioSessions.get(guildId);
    const queueLength = session?.queue?.length || 0;
    
    // Use the same song data as loading page - from trackedState (StateCoordinator)
    const currentSong = trackedState?.songData;
    if (!currentSong) {
        return {
            embeds: [{
                color: uiState.getEmbedColor(),
                description: "No song data available for playing state."
            }],
            components: []
        };
    }
    
    let musicDisplay = `**${currentSong.title}**`;
    
    // Use image processor to determine what gets shown
    const { imageProcessor } = await import('../utils/processors/image-processor.js');
    
    // Get the display image (Spotify album art for Spotify tracks, YouTube for YouTube tracks)
    const imageUrl = imageProcessor.getDisplayImage(currentSong);
    
    // Debug logging
    console.log(`[PlayingPage] Image URL: ${imageUrl}`);
    console.log(`[PlayingPage] Song source: ${currentSong.source}, isSpotify: ${currentSong.isSpotify}`);
    console.log(`[PlayingPage] Spotify image: ${currentSong.thumbnail}`);
    console.log(`[PlayingPage] YouTube image: ${currentSong.imageUrl}`);
    
    const queueInfo = {
        totalCount: session?.lazyLoadInfo?.totalCount || queueLength
    };
    if (queueInfo.totalCount > 0) {
        musicDisplay += `\n\nQueue: ${queueInfo.totalCount} song${queueInfo.totalCount === 1 ? '' : 's'} in line`;
    }
    
    // Let the state determine the volume and duration display
    const currentTime = session?.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0;
    const volumeLevel = session?.volume || 100;
    const isMuted = session?.isMuted || false;
    const volumeBarCount = Math.ceil(volumeLevel / 10);
    const filledBars = '█'.repeat(volumeBarCount);
    const emptyBars = '░'.repeat(10 - volumeBarCount);
    const volumeBar = isMuted ? '░░░░░░░░░░' : `${filledBars}${emptyBars}`;
    
    return {
        embeds: [{
            color: uiState.getEmbedColor(),
            image: imageUrl ? { url: imageUrl } : undefined,
            description: musicDisplay,
            fields: [
                {
                    name: '',
                    value: (() => {
                        const statusEmoji = '⏸'; // Pause icon for playing state
                        if (currentSong.duration && currentTime > 0) {
                            const currentFormatted = Math.floor(currentTime / 60) + ':' + (currentTime % 60).toString().padStart(2, '0');
                            // Convert milliseconds to seconds
                            const durationSeconds = Math.floor(currentSong.duration / 1000);
                            // Handle unusually long durations (more than 10 hours)
                            let totalFormatted;
                            if (durationSeconds > 36000) {
                                totalFormatted = `${Math.floor(durationSeconds / 3600)}:${Math.floor((durationSeconds % 3600) / 60).toString().padStart(2, '0')}:${(durationSeconds % 60).toString().padStart(2, '0')}`;
                            } else {
                                totalFormatted = Math.floor(durationSeconds / 60) + ':' + (durationSeconds % 60).toString().padStart(2, '0');
                            }
                            return `${statusEmoji} \`${currentFormatted} / ${totalFormatted}\``;
                        }
                        if (currentSong.duration) {
                            // Convert milliseconds to seconds
                            const durationSeconds = Math.floor(currentSong.duration / 1000);
                            let totalFormatted;
                            if (durationSeconds > 36000) {
                                totalFormatted = `${Math.floor(durationSeconds / 3600)}:${Math.floor((durationSeconds % 3600) / 60).toString().padStart(2, '0')}:${(durationSeconds % 60).toString().padStart(2, '0')}`;
                            } else {
                                totalFormatted = Math.floor(durationSeconds / 60) + ':' + (durationSeconds % 60).toString().padStart(2, '0');
                            }
                            return `${statusEmoji} \`${totalFormatted}\``;
                        }
                        return `${statusEmoji} \`Unknown\``;
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
        components: [] // Add button components here
    };
}
