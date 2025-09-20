/**
 * Querying Page Handler
 * Generates the querying state UI
 */

import { InteractionResponseType } from 'discord-interactions';
import { stateFactory } from '../states/index.js';
import { getRandomLoadingGif } from '../utils/constants/loading-gifs.js';

/**
 * Handle querying page generation
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function handleQueryingPage(guildId, djsClient, trackedState) {
    const uiState = stateFactory.getState('querying');
    
    let musicDisplay = "Searching for music...";
    
    if (trackedState?.songData) {
        musicDisplay = uiState.getDisplayText(trackedState.songData);
    } else {
        musicDisplay = uiState.getDisplayText();
    }
    
    return {
        embeds: [{
            color: uiState.getEmbedColor(),
            description: musicDisplay,
            image: { url: getRandomLoadingGif() }
        }],
        components: [] // Add button components here
    };
}
