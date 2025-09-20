/**
 * Centralized menu permissions system
 * Handles all permission checks for menu navigation
 */

import { InteractionResponseType } from 'discord-interactions';
import { checkAccessPermissions } from '../../middleware/permissionMiddleware.js';

/**
 * Check if user can access basic menu features (playback, queue, features)
 * These should be accessible to everyone by default
 */
export async function canAccessBasicMenus(djsClient, guildId, userId) {
    // Basic menus should always be accessible
    return true;
}

/**
 * Check if user can access configuration menus
 * Requires bot_controls permissions
 */
export async function canAccessConfigMenus(djsClient, guildId, userId) {
    try {
        return await checkAccessPermissions(djsClient, guildId, userId, 'bot_controls');
    } catch (error) {
        console.error('[MenuPermissions] Error checking config permissions:', error);
        return false;
    }
}

/**
 * Check if user can access admin/moderation menus
 * Requires slash_commands permissions (moderator level)
 */
export async function canAccessAdminMenus(djsClient, guildId, userId) {
    try {
        return await checkAccessPermissions(djsClient, guildId, userId, 'slash_commands');
    } catch (error) {
        console.error('[MenuPermissions] Error checking admin permissions:', error);
        return false;
    }
}

/**
 * Send permission denied response
 */
export function sendPermissionDenied(res, message = '❌ You need appropriate permissions to access this menu.') {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: message,
            flags: 64
        }
    });
}

/**
 * Send error response
 */
export function sendError(res, message = '❌ An error occurred while checking permissions.') {
    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
            embeds: [{
                title: 'Error',
                description: message,
                color: 0xFF0000
            }],
            components: [{
                type: 1, // ACTION_ROW
                components: [{
                    type: 2, // BUTTON
                    custom_id: 'menu_nav_main',
                    label: 'Back to Main Menu',
                    style: 2 // SECONDARY
                }]
            }]
        }
    });
}
