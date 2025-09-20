import { BaseState } from './base-state.js';

/**
 * Loading/Starting State
 * Music is being processed/started
 */
export class LoadingState extends BaseState {
    constructor() {
        super('loading', {
            embedColor: 0xFFA500, // Orange
            statusIcon: '⏳', // Loading icon
            loadingIndicator: '⏳ **Loading...**',
            buttonStates: {
                playPause: 'disabled',
                volume: 'disabled',
                skip: 'disabled',
                queue: 'disabled',
                addSong: 'disabled'
            },
            displayText: 'Music is loading'
        });
    }

    /**
     * Get the display text for loading state
     */
    getDisplayText(song, queueInfo) {
        // Show loading message with song title if available
        if (song && song.title) {
            return `**Loading:** \`${song.title}\`\n\nPlease wait while I find and prepare your music...`;
        }
        return '**Loading:** Music is being processed...\n\nPlease wait while I find and prepare your music...';
    }

    /**
     * Get the duration display for loading state
     */
    getDurationDisplay(song, currentTime) {
        if (song && song.duration) {
            const duration = this.formatDuration(song.duration);
            return `⏳ 0:00 / ${duration}`;
        }
        return '⏳ `Loading...`';
    }

    /**
     * Get the volume display for loading state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        if (isMuted) {
            return `🔇 **Muted** ${volumeBar}`;
        }
        return `🔊 **${volume}%** ${volumeBar}`;
    }

    /**
     * Format duration in MM:SS format
     */
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Get the loading indicator for loading state
     */
    getLoadingIndicator() {
        return '⏳ **Loading...**';
    }

}
