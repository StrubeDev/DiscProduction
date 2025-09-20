/**
 * Menu Permission Middleware
 * Handles permission checking for menu access
 */

import { InteractionResponseType } from 'discord-interactions';
import { canAccessBasicMenus, canAccessConfigMenus, canAccessAdminMenus, sendPermissionDenied, sendError } from '../../ui/permissions/menu-permissions.js';

/**
 * Check if user can access basic menus
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether user has access
 */
export async function checkBasicMenuAccess(djsClient, guildId, userId) {
    return await canAccessBasicMenus(djsClient, guildId, userId);
}

/**
 * Check if user can access config menus
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether user has access
 */
export async function checkConfigMenuAccess(djsClient, guildId, userId) {
    return await canAccessConfigMenus(djsClient, guildId, userId);
}

/**
 * Check if user can access admin menus
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether user has access
 */
export async function checkAdminMenuAccess(djsClient, guildId, userId) {
    return await canAccessAdminMenus(djsClient, guildId, userId);
}

/**
 * Send permission denied response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export function sendPermissionDeniedResponse(res, message) {
    return sendPermissionDenied(res, message);
}

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export function sendErrorResponse(res, message) {
    return sendError(res, message);
}
