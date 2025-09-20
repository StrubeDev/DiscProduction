/**
 * Playback Controls UI Utility
 * Generates the dynamic music player interface with controls and status
 */

import {
    InteractionResponseType,
    MessageComponentTypes,
    ButtonStyleTypes,
} from 'discord-interactions';
import { getVoiceConnection, VoiceConnectionStatus, AudioPlayerStatus } from '@discordjs/voice';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { playerStateManager } from '../utils/core/player-state-manager.js';
import { stateFactory } from '../states/index.js';

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

    // Get current UI state using StateCoordinator (source of truth for UI states)
    let uiState;
    let playerState = playerStateManager.getState(guildId);
    
    const { StateCoordinator } = await import('../services/state-coordinator.js');
    const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
    
    console.log(`[PlaybackControls] StateCoordinator tracked state for guild ${guildId}:`, trackedState);
    
    if (trackedState && trackedState.currentState) {
        // Use StateCoordinator's tracked state
        uiState = stateFactory.getState(trackedState.currentState);
        console.log(`[PlaybackControls] ✅ Using StateCoordinator state: ${trackedState.currentState} for guild ${guildId}`);
    } else {
        // No tracked state - use idle state as default
        uiState = stateFactory.getState('idle');
        console.log(`[PlaybackControls] ⚠️ No tracked state, using idle state for guild ${guildId}`);
    }
    
    // Get current song and queue info
    const currentSong = playerStateManager.getNowPlaying(guildId);
    const queueLength = session?.queue?.length || 0;
    
    let musicDisplay = "Nothing is currently playing.";
    let thumbnailUrl = null;
    let userProfileUrl = null;
    
    // Get volume level (default to 100% if not set)
    const volumeLevel = session?.volume || 100;
    const isMuted = session?.isMuted || false;
    
    // Create Unicode volume bar (10 bars representing 0-100%)
    const volumeBarCount = Math.ceil(volumeLevel / 10);
    const filledBars = '█'.repeat(volumeBarCount);
    const emptyBars = '░'.repeat(10 - volumeBarCount);
    const volumeBar = isMuted ? '░░░░░░░░░░' : `${filledBars}${emptyBars}`;

    // Use state-based display logic
    if (currentSong) {
        // Get display text from the current state
        const queueInfo = {
            totalCount: session?.lazyLoadInfo?.totalCount || queueLength
        };
        musicDisplay = uiState.getDisplayText(currentSong, queueInfo);
        
        // Get thumbnail URL - but don't override if StateCoordinator will set it
        if (!trackedState || !trackedState.songData) {
            thumbnailUrl = currentSong.thumbnailUrl;
        }
        
        // Get user profile picture URL if available
        if (currentSong.addedBy && currentSong.addedBy !== 'Unknown User') {
            try {
                const guild = await djsClient.guilds.fetch(guildId);
                const members = await guild.members.search({ query: currentSong.addedBy, limit: 1 });
                if (members.size > 0) {
                    const member = members.first();
                    userProfileUrl = member.user.displayAvatarURL({ size: 128, format: 'png' });
                }
            } catch (error) {
                console.log(`[PlaybackControls] Could not get user profile for ${currentSong?.addedBy || 'Unknown User'}: ${error.message}`);
            }
        }
    } else {
        // No song playing - use state-based display
        if (!isConnected) {
            musicDisplay = "Bot is not connected to a voice channel.";
        } else {
            musicDisplay = uiState.getDisplayText();
        }
    }

    // For all states, get song data from StateCoordinator when available
    let stateSongData = null;
    let stateFooterData = null;
    if (uiState.name === 'loading') {
        // Loading state needs song data for metadata display
        try {
            stateSongData = await uiState.getSongData(guildId);
            if (stateSongData) {
                // Override display text and thumbnail with state data
                const queueInfo = {
                    totalCount: session?.lazyLoadInfo?.totalCount || queueLength
                };
                musicDisplay = uiState.getDisplayText(stateSongData, queueInfo);
                thumbnailUrl = stateSongData.thumbnail || stateSongData.thumbnailUrl;
                
                // Get footer data from state
                stateFooterData = await uiState.getFooterData(guildId, djsClient);
            }
        } catch (error) {
            console.log(`[PlaybackControls] Error getting state data for ${uiState.name}:`, error.message);
        }
    } else if (uiState.name === 'querying') {
        // Querying state shows the actual query being searched
        // Get query data from StateCoordinator tracked state
        if (trackedState && trackedState.songData) {
            musicDisplay = uiState.getDisplayText(trackedState.songData);
        } else {
            musicDisplay = uiState.getDisplayText();
        }
    } else if (uiState.name === 'playing' && trackedState && trackedState.songData) {
        // Playing state should also use StateCoordinator data for consistency
        stateSongData = trackedState.songData;
        const queueInfo = {
            totalCount: session?.lazyLoadInfo?.totalCount || queueLength
        };
        musicDisplay = uiState.getDisplayText(stateSongData, queueInfo);
        thumbnailUrl = stateSongData.thumbnail || stateSongData.thumbnailUrl;
        
        // Get footer data from state
        try {
            stateFooterData = await uiState.getFooterData(guildId, djsClient);
        } catch (error) {
            console.log(`[PlaybackControls] Error getting footer data for playing state:`, error.message);
        }
    }

    // Use state-based embed color
    const embedColor = uiState.getEmbedColor();
    
    // Get image URL from state (GIF or thumbnail)
    let imageUrl = thumbnailUrl;
    if (uiState.getLoadingGifUrl) {
        try {
            const loadingGifUrl = await uiState.getLoadingGifUrl(guildId);
            if (loadingGifUrl) {
                imageUrl = loadingGifUrl;
            }
        } catch (error) {
            console.log(`[PlaybackControls] Error getting loading GIF for guild ${guildId}:`, error.message);
        }
    }
    
    const displayResult = {
        embeds: [{
            color: embedColor,
            image: imageUrl ? { url: imageUrl } : undefined,
            description: musicDisplay,
            footer: stateFooterData || ((userProfileUrl && currentSong?.addedBy) ? {
                text: `Requested by: ${currentSong.addedBy || 'Unknown User'}`,
                icon_url: userProfileUrl
            } : undefined),
            fields: (stateSongData || currentSong) ? [
                // Duration display - use state-based logic
                {
                    name: '',
                    value: (() => {
                        if (uiState.shouldShowLoading()) {
                            return uiState.getLoadingIndicator();
                        }
                        
                        // Use state-based duration display
                        const songForDisplay = stateSongData || currentSong;
                        const duration = songForDisplay?.streamDetails?.metadata?.duration || songForDisplay?.duration;
                        const currentTime = session?.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0;
                        
                        return uiState.getDurationDisplay(songForDisplay, currentTime);
                    })(),
                    inline: true
                },
                // Volume display - use state-based logic
                {
                    name: (() => {
                        if (uiState.shouldShowLoading()) {
                            return uiState.getLoadingIndicator();
                        }
                        return uiState.getVolumeDisplay(volumeLevel, isMuted, volumeBar);
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
                    // Play/Pause button - use state-based logic
                    ...(uiState.shouldShowPlayPauseButtons() ? [{
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_play_pause',
                        label: uiState.getPlayPauseButtonState() === 'pause' ? 'Pause' : 'Play',
                        style: uiState.getPlayPauseButtonState() === 'pause' ? ButtonStyleTypes.SECONDARY : ButtonStyleTypes.SUCCESS,
                        disabled: uiState.getPlayPauseButtonState() === 'disabled',
                    }] : []),
                    // Skip button - use state-based logic
                    ...(uiState.shouldShowSkipControls() ? [{
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_skip',
                        label: 'Skip',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: uiState.getSkipControlState() === 'disabled',
                    }] : []),
                    // Stop button - use state-based logic
                    ...(uiState.shouldShowSkipControls() ? [{
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_stop',
                        label: 'Stop',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: !currentSong,
                    }] : []),
                    // Shuffle button - use state-based logic
                    ...(uiState.shouldShowQueueControls() ? [{
                        type: MessageComponentTypes.BUTTON,
                        custom_id: 'remote_shuffle',
                        label: 'Shuffle',
                        style: ButtonStyleTypes.SECONDARY,
                        disabled: !session?.queue || session.queue.length < 2,
                    }] : []),
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

