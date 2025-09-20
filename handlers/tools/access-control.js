/**
 * Access Control Tool
 * Handles permission management and role assignments
 */

import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { checkModPermissions, checkAdminPermissions } from '../../middleware/permissionMiddleware.js';
import { hasModPermissions } from '../../utils/functions/permission-utils.js';

/**
 * Handle access control menu
 */
export async function handleModAccessGranter(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    console.log(`[AccessControl] handleModAccessGranter called for guild ${guildId}, user ${userId}`);

    try {
        // Check if user has mod permissions (more permissive than admin)
        console.log(`[AccessControl] Checking permissions for user ${userId} in guild ${guildId}`);
        const guild = await djsClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const hasAccess = hasModPermissions(member, guild);
        console.log(`[AccessControl] Permission check result: ${hasAccess}`);
        
        if (!hasAccess) {
            console.log(`[AccessControl] User ${userId} does not have mod permissions`);
            return res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    content: '❌ You need moderator permissions to access this feature.',
                    flags: 64
                }
            });
        }
        
        console.log(`[AccessControl] User ${userId} has mod permissions, showing menu`);

        // Create the response data object (like the working handlers do)
        const responseData = {
            embeds: [{
                title: 'Access Control',
                description: 'Manage bot permissions and role assignments',
                color: 0x506098,
                fields: [
                    { name: 'Unified Roles', value: 'Manage roles for all bot features', inline: false },
                    { name: 'Slash Commands', value: 'Control who can use slash commands', inline: false },
                    { name: 'Components', value: 'Control who can use button/menu components', inline: false },
                    { name: 'Bot Controls', value: 'Control who can manage bot settings', inline: false }
                ]
            }],
            components: [
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.PRIMARY,
                            label: 'Unified Roles',
                            custom_id: 'access_unified_roles'
                        },
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.SECONDARY,
                            label: 'Slash Commands',
                            custom_id: 'access_slash_roles'
                        },
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.SECONDARY,
                            label: 'Components',
                            custom_id: 'access_components_roles'
                        },
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.SECONDARY,
                            label: 'Bot Controls',
                            custom_id: 'access_bot_controls_roles'
                        }
                    ]
                },
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.SECONDARY,
                            label: 'Back to Features',
                            custom_id: 'menu_nav_features'
                        }
                    ]
                }
            ]
        };
        
        console.log(`[AccessControl] Sending response data:`, JSON.stringify(responseData, null, 2));
        
        // Use the same pattern as working handlers
        return res.send({ 
            type: InteractionResponseType.UPDATE_MESSAGE, 
            data: responseData 
        });
    } catch (error) {
        console.error('[AccessControl] Error:', error);
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: '❌ An error occurred while loading access control.',
                flags: 64
            }
        });
    }
}
