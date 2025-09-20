/**
 * Add Song Modal
 * Handles the add song modal UI and submission
 */

import { InteractionResponseType, MessageComponentTypes } from 'discord-interactions';

/**
 * Validate if a query is a valid song query
 */
function isValidSongQuery(query) {
    if (!query || query.trim().length === 0) {
        return false;
    }
    
    const trimmedQuery = query.trim();
    
    // Check for obviously invalid queries (JSON data, etc.)
    if (trimmedQuery.includes('"clan": null') || 
        trimmedQuery.includes('"collectibles": null') ||
        trimmedQuery.includes('"discriminator":') ||
        trimmedQuery.includes('"public_flags":') ||
        trimmedQuery.startsWith('{') ||
        trimmedQuery.startsWith('[') ||
        trimmedQuery.includes('disc-music-bot |')) {
        return false;
    }
    
    // Check for valid patterns
    const validPatterns = [
        /^https?:\/\/.*youtube\.com/,  // YouTube URLs
        /^https?:\/\/.*youtu\.be/,     // YouTube short URLs
        /^https?:\/\/.*spotify\.com/,  // Spotify URLs
        /^spotify:track:/,             // Spotify URI
        /^[a-zA-Z0-9\s\-'"]+$/        // Basic song names (letters, numbers, spaces, hyphens, quotes)
    ];
    
    return validPatterns.some(pattern => pattern.test(trimmedQuery));
}
import { ErrorCodes, ErrorMessages } from '../../../errors/index.js';

/**
 * Get modal data for adding songs
 */
export function getAddSongModalData() {
    return {
        custom_id: 'submit_add_song_modal',
        title: 'Add Song to Queue',
        components: [
            {
                type: 1, // ACTION_ROW
                components: [
                    {
                        type: 4, // TEXT_INPUT
                        custom_id: 'song_query',
                        label: 'Song Name or URL',
                        style: 1, // SHORT
                        placeholder: 'Enter song name, YouTube URL, or Spotify link...',
                        required: true,
                        max_length: 200
                    }
                ]
            }
        ]
    };
}

/**
 * Handle submission of the add song modal
 */
export async function handleSubmitAddSongModal(req, res, data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;
    const channelId = req.body.channel_id;
    
    console.log(`[AddSongModal] handleSubmitAddSongModal called for guild ${guildId}, user ${userId}`);
    // console.log(`[AddSongModal] Modal data:`, JSON.stringify(data, null, 2));
    // console.log(`[AddSongModal] Request body:`, JSON.stringify(req.body, null, 2));
    
    try {
        // Extract the song query from modal data
        const songQuery = data.components?.[0]?.components?.[0]?.value;
        
        if (!songQuery || songQuery.trim().length === 0) {
            return res.send({
                type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
            });
        }
        
        // Create interaction details for the query router
        const interactionDetails = {
            id: req.body.id,
            interactionToken: req.body.token,  // Fixed: use interactionToken instead of token
            applicationId: req.body.application_id,  // Fixed: use applicationId instead of application_id
            guild_id: guildId,
            channel_id: channelId,
            user: req.body.member?.user
        };
        
        // STEP 0: Validate query before starting loading
        if (!isValidSongQuery(songQuery.trim())) {
            console.log(`[AddSongModal] Invalid query detected: "${songQuery.trim()}"`);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Invalid query. Please provide a valid song name, YouTube URL, or Spotify URL.',
                    flags: 64
                }
            });
        }

        // CRITICAL FIX: Register embed update listeners immediately
        try {
            const { EmbedUpdateService } = await import('../../../services/embed-update-service.js');
            await EmbedUpdateService.initialize();
            EmbedUpdateService.registerGuildListeners(guildId);
            console.log(`[AddSongModal] ✅ Embed update service registered for guild ${guildId}`);
        } catch (e) {
            console.log(`[AddSongModal] Failed to register embed update service:`, e.message);
        }

        // Note: Player state will be initialized when audio session is created
        // No need to initialize here since we don't have a player yet

        // TRIGGER QUERYING STATE IMMEDIATELY (data-driven, not audio-driven)
        try {
            console.log(`[AddSongModal] 🔍 About to call StateCoordinator.setQueryingState for guild ${guildId}`);
            const { StateCoordinator } = await import('../../../services/state-coordinator.js');
            console.log(`[AddSongModal] 🔍 StateCoordinator imported successfully`);
            
            // Set querying state with query data and gif
            await StateCoordinator.setQueryingState(guildId, { 
                query: songQuery.trim(),
                timestamp: Date.now()
            });
            console.log(`[AddSongModal] ✅ Blue querying state started for guild ${guildId}`);
        } catch (e) {
            console.log(`[AddSongModal] ❌ Failed to start blue querying state:`, e.message);
            console.log(`[AddSongModal] ❌ Error stack:`, e.stack);
        }

        // Note: UI update is handled by StateCoordinator, no need for direct embed update
        // Note: Loading sequence will be handled by the unified media handler
        
        // Send deferred response to dismiss modal without any message
        res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
        
        // STEP 2: Process the query in the background (don't await)
        // Use setTimeout to ensure the response is sent before processing
        setTimeout(async () => {
            try {
                const { routePlayQuery } = await import('../../../routers/query-router.js');
                await routePlayQuery(djsClient, guildId, req.body.member, channelId, songQuery.trim(), interactionDetails, 'chat');
                console.log(`[AddSongModal] routePlayQuery completed successfully`);
            } catch (error) {
                console.error(`[AddSongModal] Error processing query:`, error);
            }
        }, 100);
        
        // Return immediately to prevent any additional responses
        return;
        
    } catch (error) {
        console.error('[AddSongModal] Error in handleSubmitAddSongModal:', error);
        return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
    }
}
