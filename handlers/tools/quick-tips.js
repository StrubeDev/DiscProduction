/**
 * Quick Tips Tool
 * Provides help and tips for using the bot
 */

import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';

/**
 * Handle quick tips menu
 */
export async function handleMenuNavTips(req, res, _data, djsClient) {
    const guildId = req.body.guild_id;
    const userId = req.body.member?.user?.id;

    console.log(`[QuickTips] handleMenuNavTips called for guild ${guildId}, user ${userId}`);

    try {
        console.log(`[QuickTips] Sending quick tips menu for user ${userId}`);
        
        const response = {
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                embeds: [{
                    title: 'Quick Tips',
                    description: 'Helpful tips and information about the bot',
                    color: 0x506098,
                    fields: [
                        { 
                            name: 'Music Commands', 
                            value: 'Use `/play <song>` to play music, `/skip` to skip, `/pause` to pause, `/resume` to resume', 
                            inline: false 
                        },
                        { 
                            name: 'Queue Management', 
                            value: 'Use `/components` to access the interactive menu for queue management and controls', 
                            inline: false 
                        },
                        { 
                            name: 'Configuration', 
                            value: 'Server owners can use the Features menu to configure bot settings and permissions', 
                            inline: false 
                        },
                        { 
                            name: 'Troubleshooting', 
                            value: 'If the bot stops responding, try `/reset` to restart the audio system', 
                            inline: false 
                        },
                        { 
                            name: 'Mobile Support', 
                            value: 'All features work on mobile devices. Use the interactive menus for the best experience', 
                            inline: false 
                        }
                    ],
                    footer: {
                        text: 'Need more help? Contact the server administrator or check the bot documentation.'
                    }
                }],
                components: [
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.PRIMARY,
                                label: 'Music Commands',
                                custom_id: 'show_music_commands'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Queue Help',
                                custom_id: 'show_queue_help'
                            }
                        ]
                    },
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Configuration Help',
                                custom_id: 'show_config_help'
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                style: ButtonStyleTypes.SECONDARY,
                                label: 'Troubleshooting',
                                custom_id: 'show_troubleshooting'
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
        };
        
        console.log(`[QuickTips] Sending response:`, JSON.stringify(response, null, 2));
        return res.send(response);
    } catch (error) {
        console.error('[QuickTips] Error:', error);
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: '❌ An error occurred while loading quick tips.',
                flags: 64
            }
        });
    }
}
