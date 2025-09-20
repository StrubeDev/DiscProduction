/**
 * Tools Page Handler
 * Generates the tools page data
 */

import { InteractionResponseType } from 'discord-interactions';
import { getToolsMenuData } from '../tools-menu.js';

/**
 * Handle tools page generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Promise<Object>} Discord message data
 */
export async function handleToolsPage(req, res, guildId, djsClient) {
    const menuData = getToolsMenuData();
    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: menuData
    });
}
