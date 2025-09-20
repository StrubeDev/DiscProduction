import { BaseState } from './base-state.js';

/**
 * Paused State
 * Music is paused but ready to resume
 */
export class PausedState extends BaseState {
    constructor() {
        super('paused', {
            embedColor: 0xFFFF00, // Yellow
            statusIcon: '▶', // Play icon
            loadingIndicator: '', // No loading
            buttonStates: {
                playPause: 'play', // Show play button
                volume: 'enabled',
                skip: 'enabled',
                queue: 'enabled',
                addSong: 'enabled'
            },
            displayText: 'Music is paused'
        });
    }

    /**
     * Get the display text for paused state
     */
    getDisplayText(song, queueInfo) {
        if (!song) return 'Nothing is currently playing.';
        
        let display = `**${song.title}**`;
        
        if (queueInfo && queueInfo.totalCount > 0) {
            display += `\n\nQueue: ${queueInfo.totalCount} song${queueInfo.totalCount === 1 ? '' : 's'} in line`;
        }
        
        return display;
    }

    /**
     * Get the duration display for paused state
     */
    getDurationDisplay(song, currentTime) {
        if (!song) return '▶ `Unknown`';
        
        const duration = song.streamDetails?.metadata?.duration;
        const statusEmoji = '▶'; // Play icon for paused state
        
        if (duration && currentTime > 0) {
            const currentFormatted = this.formatDuration(currentTime);
            const totalFormatted = this.formatDuration(duration);
            return `${statusEmoji} \`${currentFormatted} / ${totalFormatted}\``;
        }
        
        return duration ? `${statusEmoji} \`${this.formatDuration(duration)}\`` : `${statusEmoji} \`Unknown\``;
    }

    /**
     * Get the volume display for paused state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        return isMuted ? '🔇 **MUTED**' : `\`${volume}%\` ${volumeBar}`;
    }

    /**
     * Format duration from seconds to MM:SS
     */
    formatDuration(seconds) {
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
}
