/**
 * Playback Controls Page Handler
 * Generates the playback controls page data
 */

import { InteractionResponseType } from 'discord-interactions';
import { playbackcontrols } from '../playback-controls.js';

/**
 * Handle playback controls page generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Promise<Object>} Discord message data
 */
export async function handlePlaybackControlsPage(req, res, guildId, djsClient) {
    // Store the message reference using MessageReferenceManager (independent of sessions)
    try {
        const { MessageReferenceManager, MESSAGE_TYPES } = await import('../../../message/reference-managers.js');
        
        if (req.body.message) {
            // Use the new centralized reference manager (no session required)
            MessageReferenceManager.storeMessageRef(
                guildId, 
                MESSAGE_TYPES.PLAYBACK_CONTROLS, 
                req.body.message.id, 
                req.body.message.channel_id
            );
            
            console.log(`[PlaybackControls] Stored playback controls message reference for guild ${guildId}:`, {
                messageId: req.body.message.id,
                channelId: req.body.message.channel_id
            });
        } else {
            console.log(`[PlaybackControls] No message data available to store reference`);
        }
    } catch (error) {
        console.warn(`[PlaybackControls] Error storing message reference for guild ${guildId}:`, error.message);
    }
    
    // Generate the playback controls page data
    const pageData = await playbackcontrols(guildId, djsClient);
    console.log('[PlaybackControls] playbackcontrols returned:', !!pageData);
    console.log('[PlaybackControls] pageData structure:', pageData ? Object.keys(pageData) : 'null');
    
    if (!pageData) {
        throw new Error('playbackcontrols function returned null/undefined');
    }
    
    return res.send({ type: InteractionResponseType.UPDATE_MESSAGE, data: pageData });
}
