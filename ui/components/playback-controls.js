/**
 * Playback Controls Component
 * Generates the dynamic music player interface with controls and status
 */

import {
    InteractionResponseType,
    MessageComponentTypes,
    ButtonStyleTypes,
} from 'discord-interactions';
import { getVoiceConnection, VoiceConnectionStatus, AudioPlayerStatus } from '@discordjs/voice';
import { guildAudioSessions } from '../../utils/core/audio-state.js';
import { playerStateManager } from '../../utils/core/player-state-manager.js';

// Helper function to format duration from seconds to MM:SS format
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return 'Unknown';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 0) {
        return `${remainingSeconds}s`;
    } else if (remainingSeconds === 0) {
        return `${minutes}m`;
    } else {
        return `${minutes}m ${remainingSeconds}s`;
    }
}

/**
 * Generate the playback controls interface
 * @param {string} guildId - The guild ID
 * @param {Object} djsClient - Discord.js client
 * @returns {Object} Discord message data with embeds and components
 */
export async function playbackcontrols(guildId, djsClient) {
    const connection = getVoiceConnection(guildId);
    const isConnected = connection && connection.state.status !== VoiceConnectionStatus.Destroyed;
    const session = guildAudioSessions.get(guildId);

    // Use state manager instead of hardcoded checks
    const isPlaying = playerStateManager.isPlaying(guildId);
    const isPaused = playerStateManager.isPaused(guildId);
    const isBuffering = playerStateManager.isBuffering(guildId);
    const isStarting = playerStateManager.isStarting(guildId);
    const hasActiveAudio = isPlaying || isPaused;
    
    let musicDisplay = "Ready to play music! Use `/play <song name/URL>` to get started.";
    let thumbnailUrl = null;
    let userProfileUrl = null;
    
    // Check for loading/querying states first
    if (isStarting || session?.isStarting) {
        musicDisplay = "🔄 **Loading...**";
    } else if (isBuffering) {
        musicDisplay = "⏳ **Buffering...**";
    }
    
    // Get volume level (default to 100% if not set)
    const volumeLevel = session?.volume || 100;
    const isMuted = session?.isMuted || false;
    
    // Create Unicode volume bar (10 bars representing 0-100%)
    const volumeBarCount = Math.ceil(volumeLevel / 10);
    const filledBars = '█'.repeat(volumeBarCount);
    const emptyBars = '░'.repeat(10 - volumeBarCount);
    const volumeBar = isMuted ? '░░░░░░░░░░' : `${filledBars}${emptyBars}`;

    if (session?.nowPlaying) {
        const titleDisplay = session.nowPlaying.title;
        musicDisplay = `**${titleDisplay}**`;
        
        // Get thumbnail URL
        thumbnailUrl = session.nowPlaying.thumbnailUrl;
        
        // Get user profile picture URL if available
        if (session.nowPlaying.addedBy && session.nowPlaying.addedBy !== 'Unknown User') {
            try {
                const guild = await djsClient.guilds.fetch(guildId);
                const members = await guild.members.search({ query: session.nowPlaying.addedBy, limit: 1 });
                if (members.size > 0) {
                    const member = members.first();
                    userProfileUrl = member.user.displayAvatarURL({ size: 128, format: 'png' });
                }
            } catch (error) {
                console.log(`[PlaybackControls] Could not get user profile for ${session.nowPlaying?.addedBy || 'Unknown User'}: ${error.message}`);
            }
        }

        if (session.queue && session.queue.length > 0) {
            const totalQueueCount = session.lazyLoadInfo?.totalCount || session.queue.length;
            let queueText = `\n Queue: ${totalQueueCount} song${totalQueueCount === 1 ? '' : 's'} in line`;
            musicDisplay += queueText;
        }
    } else if (session?.queue && session.queue.length > 0 && !session.nowPlaying) {
        const totalQueueCount = session.lazyLoadInfo?.totalCount || session.queue.length;
        let baseText = `⏸ **Ready to play**\n\nQueue: ${totalQueueCount} song${totalQueueCount === 1 ? '' : 's'} in line`;
        musicDisplay = baseText;
    } else if (!session || !session.nowPlaying) {
        if (!isConnected) {
            musicDisplay = "Bot is not connected to a voice channel.";
        } else {
            musicDisplay = "Ready to play music! Use `/play <song name/URL>` to get started.";
        }
    }

    // Set embed color based on state
    let embedColor = 0x506098; // Default blue
    if (isStarting || isBuffering || session?.isStarting) {
        embedColor = 0xFFA500; // Orange for loading states
    } else if (isPlaying) {
        embedColor = 0x00FF00; // Green for playing
    } else if (isPaused) {
        embedColor = 0xFFFF00; // Yellow for paused
    }
    
    const displayResult = {
        embeds: [{
            color: embedColor,
            image: thumbnailUrl ? { url: thumbnailUrl } : undefined,
            description: musicDisplay,
            footer: (userProfileUrl && session?.nowPlaying?.addedBy) ? {
                text: `Requested by: ${session.nowPlaying?.addedBy || 'Unknown User'}`,
                icon_url: userProfileUrl
            } : undefined,
            fields: session?.nowPlaying ? [
                // Duration display
                {
                    name: '',
                    value: (() => {
                        if (isStarting || isBuffering || session?.isStarting) {
                            const duration = session?.nowPlaying?.duration;
                            return duration ? `⏳ \`${formatDuration(duration)}\`` : '⏳ **Loading...**';
                        }
                        
                        const duration = session?.nowPlaying?.duration;
                        const currentTime = session?.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0;
                        const statusEmoji = isPaused ? '▶' : '⏸';
                        
                        if (duration && currentTime > 0) {
                            if (currentTime > duration + 10) {
                                const currentFormatted = formatDuration(currentTime);
                                return `${statusEmoji} \`${currentFormatted} / ?\` ⚠️`;
                            } else {
                                const currentFormatted = formatDuration(currentTime);
                                const totalFormatted = formatDuration(duration);
                                return `${statusEmoji} \`${currentFormatted} / ${totalFormatted}\``;
                            }
                        }
                        return duration ? `${statusEmoji} \`${formatDuration(duration)}\`` : `${statusEmoji} \`Unknown\``;
                    })(),
                    inline: true
                },
                // Volume display
                {
                    name: (() => {
                        if (isStarting || isBuffering || session?.isStarting) {
                            return '⏳ **Loading...**';
                        }
                        return isMuted ? '🔇 **MUTED**' : `\`${volumeLevel}%\` ${volumeBar}`;
                    })(),
                    value: '',
                    inline: true
                },
            ] : [],
        }],
        components: [
            {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'open_add_song_modal',
                        label: 'Add Song',
                        style: ButtonStyleTypes.SECONDARY,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_play_pause',
                        label: isPaused ? 'Play' : 'Pause',
                        style: isPaused ? ButtonStyleTypes.SUCCESS : ButtonStyleTypes.SECONDARY,
                        disabled: !hasActiveAudio,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_skip',
                        label: 'Skip',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: !hasActiveAudio,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_stop',
                        label: 'Stop',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: !hasActiveAudio,
                    },
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_shuffle',
                        label: 'Shuffle',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: !session?.queue || session.queue.length < 2,
                    },
                ],
            },
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
    
    return displayResult;
}

/**
 * Get playback control buttons for a specific state
 * @param {string} guildId - The guild ID
 * @param {Object} djsClient - Discord.js client
 * @param {string} stateType - The current state type
 * @returns {Array} Discord button components
 */
export async function getPlaybackControlButtons(guildId, djsClient, stateType) {
    const session = guildAudioSessions.get(guildId);
    const isPlaying = playerStateManager.isPlaying(guildId);
    const isPaused = playerStateManager.isPaused(guildId);
    const isStarting = playerStateManager.isStarting(guildId);
    const isBuffering = playerStateManager.isBuffering(guildId);
    const hasActiveAudio = isPlaying || isPaused;
    
    return [
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
                    label: isPaused ? 'Play' : 'Pause',
                    style: isPaused ? 3 : 2, // SUCCESS for Play, SECONDARY for Pause
                },
                {
                    type: 2, // BUTTON
                    custom_id: 'remote_skip',
                    label: 'Skip',
                    style: 2, // SECONDARY
                },
                {
                    type: 2, // BUTTON
                    custom_id: 'remote_stop',
                    label: 'Stop',
                    style: 2, // SECONDARY
                },
                {
                    type: 2, // BUTTON
                    custom_id: 'remote_shuffle',
                    label: 'Shuffle',
                    style: 2, // SECONDARY
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
    ];
}
