/**
 * GIF Management Tool
 * Handles custom GIF management and settings
 */

import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { checkModPermissions, checkAdminPermissions } from '../../middleware/permissionMiddleware.js';
import { hasModPermissions } from '../../utils/functions/permission-utils.js';

/**
 * Handle GIF management menu
 */
export async function handleModGifManagement(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    console.log(`[GifManagement] handleModGifManagement called for guild ${guildId}, user ${userId}`);

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
                    title: 'GIF Management',
                    description: 'Manage custom GIFs and settings',
                    color: 0x506098,
                    fields: [
                        { name: 'Add GIF', value: 'Add a new custom GIF to the collection', inline: false },
                        { name: 'Remove GIF', value: 'Remove a GIF from the collection', inline: false },
                        { name: 'View All GIFs', value: 'View all custom GIFs in the collection', inline: false },
                        { name: 'Toggle Mode', value: 'Enable/disable custom GIF mode', inline: false }
                    ]
                }],
                components: [
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.PRIMARY,
                                label: 'Add GIF',
                                custom_id: 'gif_add_modal'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.DANGER,
                                label: 'Remove GIF',
                                custom_id: 'gif_remove_modal'
                            }
                        ]
                    },
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'View All GIFs',
                                custom_id: 'gif_view_all'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Toggle Mode',
                                custom_id: 'gif_toggle_mode'
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
        console.error('[GifManagement] Error:', error);
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: '❌ An error occurred while loading GIF management.',
                flags: 64
            }
        });
    }
}
