/**
 * Menu Navigation Router
 * Routes button clicks to appropriate page handlers
 */

import { InteractionResponseType } from 'discord-interactions';
import { handleMainMenuPage } from '../ui/pages/main-menu.js';
// Removed old playback controls page - using message/content-generators.js instead
import { handleBotVoiceControlsPage } from '../handlers/ui/handlers/bot-voice-controls-handler.js';
import { handleQueueHistoryPage } from '../ui/pages/queue-history.js';
import { handleToolsPage } from '../ui/pages/tools.js';
import { checkConfigMenuAccess, sendPermissionDeniedResponse, sendErrorResponse } from '../utils/middleware/menu-permissions.js';

// Import tools handlers
import { handleMenuNavMod } from '../handlers/tools/admin-panel.js';
import { handleModGifManagement } from '../handlers/tools/gif-management.js';
import { handleMenuNavTips } from '../handlers/tools/quick-tips.js';

/**
 * Route menu navigation requests
 * @param {string} customId - The button custom ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} djsClient - Discord.js client
 * @returns {Promise<void>}
 */
export async function routeMenuNavigation(customId, req, res, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;
    
    console.log(`[MenuRouter] Routing navigation for customId: ${customId}, guild: ${guildId}, user: ${userId}`);
    
    try {
        switch (customId) {
            case 'menu_nav_main':
                return await handleMainMenuPage(req, res, guildId);
                
            case 'menu_nav_config':
            case 'menu_nav_playback':
                return await handlePlaybackControlsPageNew(req, res, guildId, djsClient);
                
            case 'menu_nav_bot_voice_controls':
                // Check config permissions
                const hasConfigAccess = await checkConfigMenuAccess(djsClient, guildId, userId);
                if (!hasConfigAccess) {
                    return sendPermissionDeniedResponse(res, '❌ You need configuration permissions to access this menu.');
                }
                return await handleBotVoiceControlsPage(req, res, guildId, djsClient);
                
            case 'menu_nav_queue_history':
                return await handleQueueHistoryPage(req, res, guildId, djsClient);
                
            case 'menu_nav_tools':
                return await handleToolsPage(req, res, guildId, djsClient);
                
            case 'menu_nav_mod':
                return await handleMenuNavMod(req, res, req.body.data, djsClient);
                
            case 'menu_nav_gif_management':
                return await handleModGifManagement(req, res, req.body.data, djsClient);
                
            case 'menu_nav_tips':
                return await handleMenuNavTips(req, res, req.body.data, djsClient);
                
            default:
                console.warn(`[MenuRouter] Unknown navigation customId: ${customId}`);
                return sendErrorResponse(res, '❌ Unknown menu navigation request.');
        }
    } catch (error) {
        console.error(`[MenuRouter] Error routing navigation for ${customId}:`, error);
        return sendErrorResponse(res, '❌ An error occurred while navigating the menu.');
    }
}

/**
 * Handle playback controls page using the correct route
 */
async function handlePlaybackControlsPageNew(req, res, guildId, djsClient) {
    try {
        console.log(`[MenuRouter] Handling playback controls page for guild ${guildId}`);
        
        // Get current state from StateCoordinator
        const { StateCoordinator } = await import('../services/state-coordinator.js');
        const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
        const stateType = trackedState?.currentState || 'idle';
        
        // Generate content using the correct route
        const { generatePlaybackControlsContent } = await import('../message/content-generators.js');
        const content = await generatePlaybackControlsContent(guildId, djsClient, stateType, trackedState);
        
        // Send the response
        res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: content
        });
        
    } catch (error) {
        console.error(`[MenuRouter] Error handling playback controls page:`, error);
        res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                embeds: [{
                    color: 0xff0000,
                    description: "❌ Error loading playback controls. Please try again."
                }],
                components: []
            }
        });
    }
}
