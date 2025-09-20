import { BaseState } from './base-state.js';

/**
 * Buffering State
 * Music is buffering/loading
 */
export class BufferingState extends BaseState {
    constructor() {
        super('buffering', {
            embedColor: 0xFFA500, // Orange
            statusIcon: '⏳', // Loading icon
            loadingIndicator: '⏳ Loading...',
            buttonStates: {
                playPause: 'disabled',
                volume: 'disabled',
                skip: 'disabled',
                queue: 'disabled',
                addSong: 'disabled'
            },
            displayText: 'Music is buffering'
        });
    }

    /**
     * Get the display text for buffering state
     */
    getDisplayText(song, queueInfo) {
        if (!song) return '⏳ **Loading...**';
        
        let display = `⏳ **Loading...**\n\n**Next:** \`${song.title}\``;
        
        if (song.artist) {
            display += `\n**Artist:** ${song.artist}`;
        }
        
        display += '\n\nPreparing audio for playback...';
        
        return display;
    }

    /**
     * Get the duration display for buffering state
     */
    getDurationDisplay(song, currentTime) {
        return '⏳ `Loading...`';
    }

    /**
     * Get the volume display for buffering state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        return '⏳ **Loading...**';
    }

    /**
     * Get the loading indicator for buffering state
     */
    getLoadingIndicator() {
        return '⏳ **Loading...**';
    }
}
