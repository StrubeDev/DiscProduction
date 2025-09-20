/**
 * Queue History Page Handler
 * Generates the queue history page data
 */

import { InteractionResponseType } from 'discord-interactions';
import { getQueueHistoryPageData } from './queue-management.js';

/**
 * Handle queue history page generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Promise<Object>} Discord message data
 */
export async function handleQueueHistoryPage(req, res, guildId, djsClient) {
    const pageData = await getQueueHistoryPageData(guildId, djsClient);
    console.log('[QueueHistory] Queue pageData received:', !!pageData);
    console.log('[QueueHistory] Queue pageData structure:', pageData ? Object.keys(pageData) : 'null');
    
    if (!pageData) {
        throw new Error('getQueueHistoryPageData returned null/undefined');
    }
    
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: pageData });
}
