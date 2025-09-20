/**
 * Tools Menu UI Utility
 * Generates the tools menu page data
 */

import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';

/**
 * Get the tools/features menu data
 * This should be the single source of truth for the tools menu UI
 */
export function getToolsMenuData() {
    return {
        embeds: [{
            title: 'Features Menu',
            description: 'Select a feature to access:',
            color: 0x506098,
            fields: [
                { name: 'Access Control', value: 'Manage who can use different bot features.', inline: false },
                { name: 'Admin Panel', value: 'Moderation controls for managing the bot and users.', inline: false },
                { name: 'GIF Management', value: 'Customize bot GIFs for your server.', inline: false },
                { name: 'Quick Tips', value: 'Get help and learn about bot features.', inline: false }
            ]
        }],
        components: [
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'mod_access_granter',
                        label: 'Access Control',
                        style: ButtonStyleTypes.SECONDARY,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'menu_nav_mod_menu',
                        label: 'Admin Panel',
                        style: ButtonStyleTypes.SECONDARY,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'mod_gif_management',
                        label: 'GIF Management',
                        style: ButtonStyleTypes.SECONDARY,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'menu_nav_tips',
                        label: 'Quick Tips',
                        style: ButtonStyleTypes.SECONDARY,
                    }
                ]
            },
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'menu_nav_main',
                        label: 'Back to Main Menu',
                        style: ButtonStyleTypes.SECONDARY
                    }
                ]
            }
        ]
    };
}
