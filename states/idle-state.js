import { BaseState } from './base-state.js';

/**
 * Idle State
 * No music is playing
 */
export class IdleState extends BaseState {
    constructor() {
        super('idle', {
            embedColor: 0x506098, // Default blue
            statusIcon: '', // No status icon
            loadingIndicator: '', // No loading
            buttonStates: {
                playPause: 'disabled',
                volume: 'disabled',
                skip: 'disabled',
                queue: 'enabled',
                addSong: 'enabled'
            },
            displayText: 'No music is playing'
        });
    }

    /**
     * Get the display text for idle state
     */
    getDisplayText(song, queueInfo, isConnected) {
        if (!isConnected) {
            return 'Bot is not connected to a voice channel.';
        }
        
        if (queueInfo && queueInfo.totalCount > 0) {
            return `⏸ **Ready to play**\n\nQueue: ${queueInfo.totalCount} song${queueInfo.totalCount === 1 ? '' : 's'} in line`;
        }
        
        return 'Ready to play music! Use `/play <song name/URL>` to get started.';
    }

    /**
     * Get the duration display for idle state
     */
    getDurationDisplay(song, currentTime) {
        return ''; // No duration display in idle state
    }

    /**
     * Get the volume display for idle state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        return ''; // No volume display in idle state
    }

    /**
     * Check if this state should show duration field
     */
    shouldShowDurationField() {
        return false;
    }

    /**
     * Check if this state should show volume field
     */
    shouldShowVolumeField() {
        return false;
    }
}
