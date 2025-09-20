/**
 * Default Page Handler
 * Generates the default state UI when no specific state is active
 */

import { InteractionResponseType } from 'discord-interactions';

/**
 * Handle default page generation
 * @param {string} guildId - Guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {Object} trackedState - StateCoordinator tracked state
 * @returns {Object} Discord message data
 */
export async function handleDefaultPage(guildId, djsClient, trackedState) {
    return {
        embeds: [{
            color: 0x506098, // Default blue
            description: "Bot is not connected to a voice channel."
        }],
        components: [
            {
                type: 1, // ACTION_ROW
                components: [
                    {
                        type: 2, // BUTTON
                        custom_id: 'open_add_song_modal',
                        label: 'Add Song',
                        style: 2, // SECONDARY
                    },
                    {
                        type: 2, // BUTTON
                        custom_id: 'remote_play_pause',
                        label: 'Play',
                        style: 2, // SECONDARY
                        disabled: true,
                    },
                    {
                        type: 2, // BUTTON
                        custom_id: 'remote_skip',
                        label: 'Skip',
                        style: 2, // SECONDARY
                        disabled: true,
                    },
                    {
                        type: 2, // BUTTON
                        custom_id: 'remote_stop',
                        label: 'Stop',
                        style: 2, // SECONDARY
                        disabled: true,
                    },
                    {
                        type: 2, // BUTTON
                        custom_id: 'remote_shuffle',
                        label: 'Shuffle',
                        style: 2, // SECONDARY
                        disabled: true,
                    },
                ],
            },
            {
                type: 1, // ACTION_ROW
                components: [{
                    type: 2, // BUTTON
                    custom_id: 'menu_nav_main',
                    style: 2, // SECONDARY
                    label: 'Back',
                }],
            },
        ]
    };
}

