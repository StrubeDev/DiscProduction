/**
 * Modal Data Utilities
 * Generates modal data for Discord modals
 */

import { MessageComponentTypes } from 'discord-interactions';

/**
 * Get timeout modal data
 */
export function getSetTimeoutModalData() {
    return {
        title: 'Set Timeout',
        custom_id: 'set_timeout_modal',
        components: [{
            type: 1, // ACTION_ROW
            components: [{
                type: 4, // TEXT_INPUT
                custom_id: 'timeout_minutes',
                label: 'Timeout (minutes)',
                style: 1, // SHORT
                placeholder: 'Enter timeout in minutes...',
                required: true,
                max_length: 3
            }]
        }]
    };
}

/**
 * Get duration modal data
 */
export function getSetDurationModalData() {
    return {
        title: 'Set Duration',
        custom_id: 'set_duration_modal',
        components: [{
            type: 1, // ACTION_ROW
            components: [{
                type: 4, // TEXT_INPUT
                custom_id: 'duration_seconds',
                label: 'Duration (seconds)',
                style: 1, // SHORT
                placeholder: 'Enter duration in seconds...',
                required: true,
                max_length: 10
            }]
        }]
    };
}
