/**
 * Usage Example: How to integrate the new state system
 * This shows how to replace the old hardcoded UI logic
 */

import { stateFactory } from './index.js';

// OLD WAY (what we're replacing):
function oldPlaybackControls(guildId, djsClient) {
    const session = guildAudioSessions.get(guildId);
    const isPlaying = session?.player?.state?.status === AudioPlayerStatus.Playing;
    const isPaused = session?.player?.state?.status === AudioPlayerStatus.Paused;
    const isBuffering = session?.player?.state?.status === AudioPlayerStatus.Buffering;
    
    // Hardcoded logic scattered throughout
    let embedColor = 0x506098; // Default blue
    if (session?.isStarting || isBuffering) {
        embedColor = 0xFFA500; // Orange
    } else if (isPlaying) {
        embedColor = 0x00FF00; // Green
    } else if (isPaused) {
        embedColor = 0xFFFF00; // Yellow
    }
    
    // More hardcoded logic...
}

// NEW WAY (using state system):
function newPlaybackControls(guildId, djsClient) {
    const session = guildAudioSessions.get(guildId);
    const discordStatus = session?.player?.state?.status || 'idle';
    const isStarting = playerStateManager.isStarting(guildId);
    
    // Get the appropriate state
    const state = stateFactory.getStateForDiscordStatus(discordStatus, isStarting);
    
    // Use state methods instead of hardcoded logic
    const embedColor = state.getEmbedColor();
    const statusIcon = state.getStatusIcon();
    const loadingIndicator = state.getLoadingIndicator();
    
    // Get display text using state logic
    const nowPlaying = playerStateManager.getNowPlaying(guildId);
    const queueInfo = {
        totalCount: session?.lazyLoadInfo?.totalCount || session?.queue?.length || 0
    };
    const isConnected = connection && connection.state.status !== VoiceConnectionStatus.Destroyed;
    
    const musicDisplay = state.getDisplayText(nowPlaying, queueInfo, isConnected);
    
    // Get button states
    const buttonStates = state.getButtonStates();
    
    // Build embed using state configuration
    const embed = {
        color: embedColor,
        description: musicDisplay,
        fields: []
    };
    
    // Add duration field if state supports it
    if (state.shouldShowDurationField()) {
        const currentTime = session?.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : 0;
        embed.fields.push({
            name: '',
            value: state.getDurationDisplay(nowPlaying, currentTime),
            inline: true
        });
    }
    
    // Add volume field if state supports it
    if (state.shouldShowVolumeField()) {
        const volume = session?.volume || 100;
        const isMuted = session?.isMuted || false;
        const volumeBar = '░'.repeat(10); // Simplified for example
        embed.fields.push({
            name: state.getVolumeDisplay(volume, isMuted, volumeBar),
            value: '',
            inline: true
        });
    }
    
    return { embeds: [embed] };
}
