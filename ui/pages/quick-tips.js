/**
 * Quick tips page and related functions
 */

import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';

export function getQuickTipsPageData() {
    return {
        embeds: [
            {
                title: '💡 Quick Tips & Help',
                description: 'Get the most out of your music bot!',
                color: 0x506098,
                fields: [
                    { name: 'Discover Commands', value: 'Type `/` in the chat to see a list of all available commands for this bot.', inline: false },
                    { name: 'Need Assistance?', value: 'If you have a support server, mention it here, or provide info for the `/help` command.', inline: false },
                ],
            },
        ],
        components: [
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [{
                    type: MessageComponentTypes.BUTTON,
                    custom_id: 'menu_nav_main',
                    style: ButtonStyleTypes.SECONDARY,
                    label: 'Back',
                }],
            },
        ],
    };
}
