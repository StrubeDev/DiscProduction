import { BaseState } from './base-state.js';

/**
 * Error State
 * An error occurred during playback
 */
export class ErrorState extends BaseState {
    constructor() {
        super('error', {
            embedColor: 0xFF0000, // Red
            statusIcon: '❌', // Error icon
            loadingIndicator: '❌ Error occurred',
            buttonStates: {
                playPause: 'disabled',
                volume: 'disabled',
                skip: 'disabled',
                queue: 'enabled',
                addSong: 'enabled'
            },
            displayText: 'An error occurred'
        });
    }

    /**
     * Get the display text for error state
     */
    getDisplayText(song, queueInfo, errorMessage) {
        let display = '❌ **Error occurred**';
        
        if (errorMessage) {
            display += `\n\n**Error:** ${errorMessage}`;
        }
        
        if (queueInfo && queueInfo.totalCount > 0) {
            display += `\n\nQueue: ${queueInfo.totalCount} song${queueInfo.totalCount === 1 ? '' : 's'} in line`;
        }
        
        return display;
    }

    /**
     * Get the duration display for error state
     */
    getDurationDisplay(song, currentTime) {
        return '❌ `Error`';
    }

    /**
     * Get the volume display for error state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        return '❌ **Error**';
    }

    /**
     * Get the loading indicator for error state
     */
    getLoadingIndicator() {
        return '❌ **Error occurred**';
    }
}
