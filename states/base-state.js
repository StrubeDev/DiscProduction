/**
 * Base State Class
 * Provides common functionality for all UI states
 */
export class BaseState {
    constructor(name, config) {
        this.name = name;
        this.config = {
            // Default configuration
            embedColor: 0x506098, // Default blue
            statusIcon: '',
            loadingIndicator: '',
            buttonStates: {},
            displayText: '',
            ...config
        };
    }

    /**
     * Get the embed color for this state
     */
    getEmbedColor() {
        return this.config.embedColor;
    }

    /**
     * Get the status icon for this state
     */
    getStatusIcon() {
        return this.config.statusIcon;
    }

    /**
     * Get the loading indicator text
     */
    getLoadingIndicator() {
        return this.config.loadingIndicator;
    }

    /**
     * Get button configuration for this state
     */
    getButtonStates() {
        return this.config.buttonStates;
    }

    /**
     * Get the display text for this state
     */
    getDisplayText() {
        return this.config.displayText;
    }

    /**
     * Check if this state should show loading indicators
     */
    shouldShowLoading() {
        return !!this.config.loadingIndicator;
    }

    /**
     * Check if this state should show play/pause buttons
     */
    shouldShowPlayPauseButtons() {
        return this.config.buttonStates.playPause !== false;
    }

    /**
     * Get the play/pause button state
     */
    getPlayPauseButtonState() {
        return this.config.buttonStates.playPause || 'disabled';
    }

    /**
     * Check if this state should show volume controls
     */
    shouldShowVolumeControls() {
        return this.config.buttonStates.volume !== false;
    }

    /**
     * Get the volume control state
     */
    getVolumeControlState() {
        return this.config.buttonStates.volume || 'enabled';
    }

    /**
     * Check if this state should show skip controls
     */
    shouldShowSkipControls() {
        return this.config.buttonStates.skip !== false;
    }

    /**
     * Get the skip control state
     */
    getSkipControlState() {
        return this.config.buttonStates.skip || 'enabled';
    }

    /**
     * Check if this state should show queue controls
     */
    shouldShowQueueControls() {
        return this.config.buttonStates.queue !== false;
    }

    /**
     * Get the queue control state
     */
    getQueueControlState() {
        return this.config.buttonStates.queue || 'enabled';
    }

    /**
     * Validate state configuration
     */
    validate() {
        const required = ['embedColor', 'statusIcon', 'buttonStates'];
        const missing = required.filter(key => !(key in this.config));
        
        if (missing.length > 0) {
            throw new Error(`State ${this.name} missing required configuration: ${missing.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Get state summary for debugging
     */
    getSummary() {
        return {
            name: this.name,
            embedColor: this.config.embedColor,
            statusIcon: this.config.statusIcon,
            loadingIndicator: this.config.loadingIndicator,
            buttonStates: this.config.buttonStates,
            displayText: this.config.displayText
        };
    }
}
