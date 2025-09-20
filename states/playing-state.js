import { BaseState } from './base-state.js';

/**
 * Playing State
 * Music is actively playing
 */
export class PlayingState extends BaseState {
    constructor() {
        super('playing', {
            embedColor: 0x00FF00, // Green
            statusIcon: '⏸', // Pause icon
            loadingIndicator: '', // No loading
            buttonStates: {
                playPause: 'pause', // Show pause button
                volume: 'enabled',
                skip: 'enabled',
                queue: 'enabled',
                addSong: 'enabled'
            },
            displayText: 'Music is playing'
        });
    }

    /**
     * Get the display text for playing state
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
     * Get the duration display for playing state
     */
    getDurationDisplay(song, currentTime) {
        if (!song) return '⏸ `Unknown`';
        
        const duration = song.streamDetails?.metadata?.duration;
        const statusEmoji = '⏸'; // Pause icon for playing state
        
        if (duration && currentTime > 0) {
            const currentFormatted = this.formatDuration(currentTime);
            const totalFormatted = this.formatDuration(duration);
            return `${statusEmoji} \`${currentFormatted} / ${totalFormatted}\``;
        }
        
        return duration ? `${statusEmoji} \`${this.formatDuration(duration)}\`` : `${statusEmoji} \`Unknown\``;
    }

    /**
     * Get the volume display for playing state
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
