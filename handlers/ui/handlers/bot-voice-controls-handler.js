/**
 * Bot Voice Controls Page Handler
 * Generates the bot voice controls page data
 */

import { InteractionResponseType } from 'discord-interactions';
import { getBotVoiceControlsPageData } from '../../../ui/pages/bot-voice-controls.js';

/**
 * Handle bot voice controls page generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Promise<Object>} Discord message data
 */
export async function handleBotVoiceControlsPage(req, res, guildId, djsClient) {
    const pageData = await getBotVoiceControlsPageData(guildId, djsClient);
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: pageData });
}
