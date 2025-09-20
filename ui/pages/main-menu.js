/**
 * Main Menu Page Handler
 * Generates the main menu page data
 */

import { getMainMenuMessageDataWithThumbnail } from '../../commands/components.js';

/**
 * Handle main menu page generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Discord message data
 */
export async function handleMainMenuPage(req, res, guildId) {
    const menuData = await getMainMenuMessageDataWithThumbnail(guildId);
    return res.send({ type: 7, data: menuData }); // UPDATE_MESSAGE
}
