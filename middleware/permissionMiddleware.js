import { InteractionResponseType } from 'discord-interactions';
import { canUseModCommands, canUseAdminCommands } from '../utils/functions/permission-utils.js';
import { getGuildSettings } from '../utils/database/guildSettings.js';

/**
 * Helper function to check if a user has access based on server owner or role-based permissions
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} accessType - Type of access to check ('slash_commands', 'components', 'bot_controls')
 * @returns {Promise<boolean>} - True if user has access
 */
export async function checkAccessPermissions(djsClient, guildId, userId, accessType) {
    try {
        // Reduced debug logging - only log essential permission info
        const settings = await getGuildSettings(guildId);
        const accessSetting = settings[`${accessType}_access`] || 'server_owner';
        const allowedRoles = settings[`${accessType}_roles`] || [];
        
        console.log(`[PERMISSION_DEBUG] ${accessType} check for user ${userId} in guild ${guildId}: ${accessSetting} (${allowedRoles.length} roles)`);
        
        // If set to "everyone", allow access
        if (accessSetting === 'everyone') {
            return true;
        }
        
        // Get guild and member information
        const guild = await djsClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        // Check if user is server owner
        if (member.id === guild.ownerId) {
            return true;
        }
        
        // If set to "server_owner" and user is not owner, deny access
        if (accessSetting === 'server_owner') {
            return false;
        }
        
        // Check role-based access
        if (accessSetting === 'roles' && allowedRoles.length > 0) {
            const userRoles = member.roles.cache.map(role => role.id);
            const hasAllowedRole = userRoles.some(roleId => allowedRoles.includes(roleId));
            return hasAllowedRole;
        }
        
        return false;
    } catch (error) {
        console.error(`Error checking ${accessType} permissions:`, error);
        return false;
    }
}

/**
 * Wrapper function to check permissions before executing a command
 * @param {Function} commandHandler - The original command handler function
 * @returns {Function} - Wrapped command handler with permission check
 */
export function requireModPermissions(commandHandler) {
    return async (req, res, djsClient) => {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id;
        
        if (!guildId || !userId) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Unable to verify permissions. Please try again.',
                    flags: 64
                }
            });
        }

        try {
            const hasAccess = await checkAccessPermissions(djsClient, guildId, userId, 'slash_commands');
            
            if (!hasAccess) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ You need appropriate permissions to use this command.',
                        flags: 64
                    }
                });
            }
            
            // User has permissions, proceed with the command
            return commandHandler(req, res, djsClient);
        } catch (error) {
            console.error('Error checking permissions:', error);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Error checking permissions. Please try again.',
                    flags: 64
                }
            });
        }
    };
}

/**
 * Wrapper function to check admin permissions before executing a command
 * @param {Function} commandHandler - The original command handler function
 * @returns {Function} - Wrapped command handler with permission check
 */
export function requireAdminPermissions(commandHandler) {
    return async (req, res, djsClient) => {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id;
        
        if (!guildId || !userId) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Unable to verify permissions. Please try again.',
                    flags: 64
                }
            });
        }

        try {
            const guild = await djsClient.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            
            if (!canUseAdminCommands(member, guild)) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ You need administrator permissions to use this command.',
                        flags: 64
                    }
                });
            }
            
            // User has permissions, proceed with the command
            return commandHandler(req, res, djsClient);
        } catch (error) {
            console.error('Error checking permissions:', error);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Error checking permissions. Please try again.',
                    flags: 64
                }
            });
        }
    };
}

/**
 * Helper function to check if a user has component permissions (for use in component handlers)
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user has component permissions
 */
export async function checkModPermissions(djsClient, guildId, userId) {
    return await checkAccessPermissions(djsClient, guildId, userId, 'components');
}

/**
 * Helper function to check if a user has admin permissions (for use in component handlers)
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user has admin permissions
 */
export async function checkAdminPermissions(djsClient, guildId, userId) {
    try {
        const guild = await djsClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        return canUseAdminCommands(member, guild);
    } catch (error) {
        console.error('Error checking admin permissions:', error);
        return false;
    }
}

/**
 * Helper function to check if a user has config permissions (for use in component handlers)
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user has config permissions
 */
export async function checkBotControlsPermissions(djsClient, guildId, userId) {
    return await checkAccessPermissions(djsClient, guildId, userId, 'bot_controls');
}

/**
 * Check if a user has permission to change slash command access type (everyone/roles)
 * This allows users with slash_commands_roles to toggle between 'everyone' and 'roles'
 * @param {Object} djsClient - Discord.js client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user can change access type
 */
export async function canChangeSlashAccessType(djsClient, guildId, userId) {
    try {
        const settings = await getGuildSettings(guildId);
        const allowedRoles = settings.slash_commands_roles || [];
        
        // Get guild and member information
        const guild = await djsClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        // Server owner can always change access type
        if (member.id === guild.ownerId) {
            return true;
        }
        
        // Check if user has any of the configured slash command roles
        if (allowedRoles.length > 0) {
            const userRoles = member.roles.cache.map(role => role.id);
            const hasAllowedRole = userRoles.some(roleId => allowedRoles.includes(roleId));
            return hasAllowedRole;
        }
        
        return false;
    } catch (error) {
        console.error(`Error checking slash access type change permissions:`, error);
        return false;
    }
}
