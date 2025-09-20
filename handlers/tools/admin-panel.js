/**
 * Admin Panel Tool
 * Handles moderation and server management features
 */

import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { checkModPermissions, checkAdminPermissions } from '../../middleware/permissionMiddleware.js';
import { hasModPermissions } from '../../utils/functions/permission-utils.js';

/**
 * Handle admin panel menu
 */
export async function handleMenuNavMod(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    console.log(`[AdminPanel] handleMenuNavMod called for guild ${guildId}, user ${userId}`);

    try {
        // Check if user has mod permissions (more permissive than admin)
        const guild = await djsClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const hasAccess = hasModPermissions(member, guild);
        
        if (!hasAccess) {
            return res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    content: '❌ You need moderator permissions to access this feature.',
                    flags: 64
                }
            });
        }

        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                embeds: [{
                    title: 'Admin Panel',
                    description: 'Server moderation and management tools',
                    color: 0x506098,
                    fields: [
                        { name: 'Bot Configuration', value: 'Configure bot settings and voice channels', inline: false },
                        { name: 'Role Management', value: 'Manage server roles and permissions', inline: false },
                        { name: 'Server Stats', value: 'View server statistics and activity', inline: false },
                        { name: 'Moderation Tools', value: 'Advanced moderation features', inline: false }
                    ]
                }],
                components: [
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.PRIMARY,
                                label: 'Bot Configuration',
                                custom_id: 'menu_nav_bot_voice_controls'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Role Management',
                                custom_id: 'access_unified_roles'
                            }
                        ]
                    },
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Server Stats',
                                custom_id: 'view_server_stats'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Moderation Tools',
                                custom_id: 'moderation_tools'
                            }
                        ]
                    },
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.DANGER,
                                label: 'Back to Features',
                                custom_id: 'menu_nav_features'
                            }
                        ]
                    }
                ]
            }
        });
    } catch (error) {
        console.error('[AdminPanel] Error:', error);
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: '❌ An error occurred while loading admin panel.',
                flags: 64
            }
        });
    }
}
