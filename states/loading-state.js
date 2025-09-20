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
        if (!song) return '**Loading:** Music is being processed...\n\nPlease wait while I find and prepare your music...';
        
        // Match playing state layout - song name at top, no emojis
        let display = `**${song.title}**`;
        
        if (queueInfo && queueInfo.totalCount > 0) {
            display += `\n\nQueue: ${queueInfo.totalCount} song${queueInfo.totalCount === 1 ? '' : 's'} in line`;
        }
        
        return display;
    }

    /**
     * Get the duration display for loading state
     */
    getDurationDisplay(song, currentTime) {
        if (!song) return '⏳ `Loading...`';
        
        const duration = song.duration;
        if (duration && duration !== 'Unknown Duration') {
            const durationFormatted = this.formatDuration(duration);
            return `⏳ \`${durationFormatted}\``;
        }
        
        return '⏳ `Loading...`';
    }

    /**
     * Get the volume display for loading state
     */
    getVolumeDisplay(volume, isMuted, volumeBar) {
        return isMuted ? '🔇 **MUTED**' : `\`${volume}%\` ${volumeBar}`;
    }

    /**
     * Get the loading indicator for loading state
     */
    getLoadingIndicator() {
        return '⏳ **Loading...**';
    }

    /**
     * Override shouldShowLoading to show actual metadata when we have song data
     */
    shouldShowLoading() {
        return false; // Always show actual metadata instead of loading indicator
    }

    /**
     * Loading state should show song thumbnail, not a GIF
     * Return null to let the song's thumbnail be used
     */
    async getLoadingGifUrl(guildId) {
        // Loading state should show the song's thumbnail, not a GIF
        return null;
    }

    /**
     * Get song data from StateCoordinator for loading state
     */
    async getSongData(guildId) {
        try {
            const { StateCoordinator } = await import('../services/state-coordinator.js');
            const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
            
            if (trackedState && trackedState.songData) {
                return trackedState.songData;
            }
            
            return null;
        } catch (error) {
            console.error(`[LoadingState] Error getting song data for guild ${guildId}:`, error.message);
            return null;
        }
    }

    /**
     * Get user profile URL for footer
     */
    async getUserProfileUrl(guildId, djsClient, addedBy) {
        if (!addedBy || addedBy === 'Unknown User') {
            return null;
        }
        
        try {
            const guild = await djsClient.guilds.fetch(guildId);
            const members = await guild.members.search({ query: addedBy, limit: 1 });
            if (members.size > 0) {
                const member = members.first();
                return member.user.displayAvatarURL({ size: 128, format: 'png' });
            }
        } catch (error) {
            console.log(`[LoadingState] Could not get user profile for ${addedBy}: ${error.message}`);
        }
        
        return null;
    }

    /**
     * Get footer data for loading state
     */
    async getFooterData(guildId, djsClient) {
        const songData = await this.getSongData(guildId);
        if (!songData || !songData.addedBy) {
            return null;
        }
        
        const userProfileUrl = await this.getUserProfileUrl(guildId, djsClient, songData.addedBy);
        
        return {
            text: `Requested by: ${songData.addedBy}`,
            icon_url: userProfileUrl
        };
    }

    /**
     * Format duration from seconds to MM:SS
     */
    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return 'Unknown';
        
        // Convert to seconds if it's in milliseconds (duration > 10000 suggests milliseconds)
        let durationInSeconds = seconds;
        if (seconds > 10000) {
            durationInSeconds = Math.floor(seconds / 1000);
        }
        
        const minutes = Math.floor(durationInSeconds / 60);
        const remainingSeconds = durationInSeconds % 60;
        
        if (minutes === 0) {
            return `${remainingSeconds}s`;
        } else if (remainingSeconds === 0) {
            return `${minutes}m`;
        } else {
            return `${minutes}m ${remainingSeconds}s`;
        }
    }
}