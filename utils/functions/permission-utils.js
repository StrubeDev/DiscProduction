import { PermissionFlagsBits } from 'discord.js';

/**
 * Check if a user has moderator permissions in a guild
 * @param {Object} member - Discord GuildMember object
 * @param {Object} guild - Discord Guild object
 * @returns {boolean} - True if user has mod permissions
 */
export function hasModPermissions(member, guild) {
    // Server owner always has mod permissions
    if (member.id === guild.ownerId) {
        return true;
    }

    // Check for moderator permissions
    const permissions = member.permissions;
    return permissions.has(PermissionFlagsBits.ManageGuild) ||
           permissions.has(PermissionFlagsBits.ManageChannels) ||
           permissions.has(PermissionFlagsBits.ManageMessages) ||
           permissions.has(PermissionFlagsBits.MuteMembers) ||
           permissions.has(PermissionFlagsBits.DeafenMembers) ||
           permissions.has(PermissionFlagsBits.MoveMembers) ||
           permissions.has(PermissionFlagsBits.ManageRoles);
}

/**
 * Check if a user has admin permissions in a guild
 * @param {Object} member - Discord GuildMember object
 * @param {Object} guild - Discord Guild object
 * @returns {boolean} - True if user has admin permissions
 */
export function hasAdminPermissions(member, guild) {
    // Server owner always has admin permissions
    if (member.id === guild.ownerId) {
        return true;
    }

    // Check for administrator permission
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Get user's permission level in a guild
 * @param {Object} member - Discord GuildMember object
 * @param {Object} guild - Discord Guild object
 * @returns {string} - 'owner', 'admin', 'mod', or 'user'
 */
export function getPermissionLevel(member, guild) {
    if (member.id === guild.ownerId) {
        return 'owner';
    }
    
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return 'admin';
    }
    
    if (hasModPermissions(member, guild)) {
        return 'mod';
    }
    
    return 'user';
}

/**
 * Check if a user can use mod commands
 * @param {Object} member - Discord GuildMember object
 * @param {Object} guild - Discord Guild object
 * @returns {boolean} - True if user can use mod commands
 */
export function canUseModCommands(member, guild) {
    return hasModPermissions(member, guild);
}

/**
 * Check if a user can use admin commands
 * @param {Object} member - Discord GuildMember object
 * @param {Object} guild - Discord Guild object
 * @returns {boolean} - True if user can use admin commands
 */
export function canUseAdminCommands(member, guild) {
    return hasAdminPermissions(member, guild);
}
