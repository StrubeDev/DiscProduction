/**
 * Idle Page Handler
 * Generates the idle state UI
 */

import { InteractionResponseType } from 'discord-interactions';
import { stateFactory } from '../states/index.js';

/**
 * Handle idle page generation
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function handleIdlePage(guildId, djsClient, trackedState) {
    const uiState = stateFactory.getState('idle');
    
    return {
        embeds: [{
            color: uiState.getEmbedColor(),
            description: "Nothing is currently playing."
        }],
        components: [] // Add button components here
    };
}
