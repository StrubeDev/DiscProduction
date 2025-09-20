// errors/error-utils.js
// Error Utility Functions

import { createError, throwError, errorHandler } from './index.js';
import { ErrorCodes } from './error-codes.js';
import { ErrorMessages } from './error-messages.js';

/**
 * Common error checking utilities
 */
export const ErrorUtils = {
    /**
     * Check if error is a specific type
     */
    isErrorType: (error, code) => {
        return error && error.code === code;
    },

    /**
     * Check if error is a media processing error
     */
    isMediaError: (error) => {
        return error && error.code && error.code.startsWith('MEDIA_');
    },

    /**
     * Check if error is a session error
     */
    isSessionError: (error) => {
        return error && error.code && error.code.startsWith('SESSION_');
    },

    /**
     * Check if error is a network error
     */
    isNetworkError: (error) => {
        return error && error.code && error.code.startsWith('NETWORK_');
    },

    /**
     * Check if error is a Discord API error
     */
    isDiscordError: (error) => {
        return error && error.code && error.code.startsWith('DISCORD_');
    },

    /**
     * Check if error is retryable
     */
    isRetryable: (error) => {
        const retryableCodes = [
            'NETWORK_5001', // Request timeout
            'NETWORK_5002', // Connection failed
            'NETWORK_5004', // API unavailable
            'NETWORK_5009', // Server error
            'SYSTEM_7003'   // Process creation failed
        ];
        return error && retryableCodes.includes(error.code);
    },

    /**
     * Check if error should be logged
     */
    shouldLog: (error) => {
        const silentCodes = [
            'QUEUE_3002', // Song already in queue
            'VALIDATION_4004' // Invalid query
        ];
        return !error || !silentCodes.includes(error.code);
    }
};

/**
 * Error wrapping utilities
 */
export const ErrorWrappers = {
    /**
     * Wrap async function with error handling
     */
    withErrorHandling: (fn, context = {}) => {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                errorHandler.handleError(error, context);
                throw error;
            }
        };
    },

    /**
     * Wrap sync function with error handling
     */
    withSyncErrorHandling: (fn, context = {}) => {
        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                errorHandler.handleError(error, context);
                throw error;
            }
        };
    },

    /**
     * Wrap function with specific error type
     */
    withErrorType: (fn, errorType, context = {}) => {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const wrappedError = createError[errorType](error.code || 'UNKNOWN_ERROR', error.details);
                errorHandler.handleError(wrappedError, context);
                throw wrappedError;
            }
        };
    }
};

/**
 * Common error patterns
 */
export const CommonErrors = {
    /**
     * Create duration limit error
     */
    durationLimitExceeded: (duration, limit) => {
        return createError.media(ErrorCodes.MEDIA_PROCESSING.DURATION_LIMIT_EXCEEDED, {
            duration,
            limit,
            durationFormatted: formatDuration(duration),
            limitFormatted: formatDuration(limit)
        });
    },

    /**
     * Create session not found error
     */
    sessionNotFound: (guildId) => {
        return createError.session(ErrorCodes.SESSION.NO_ACTIVE_SESSION, { guildId });
    },

    /**
     * Create permission denied error
     */
    permissionDenied: (permission, channelId) => {
        return createError.session(ErrorCodes.SESSION.PERMISSION_DENIED, { permission, channelId });
    },

    /**
     * Create invalid URL error
     */
    invalidUrl: (url, expectedType) => {
        return createError.validation(ErrorCodes.VALIDATION.INVALID_QUERY, { url, expectedType });
    },

    /**
     * Create network timeout error
     */
    networkTimeout: (operation, timeout) => {
        return createError.network(ErrorCodes.NETWORK.REQUEST_TIMEOUT, { operation, timeout });
    },

    /**
     * Create Discord API error
     */
    discordApiError: (status, message) => {
        return createError.network(ErrorCodes.NETWORK.DISCORD_API_ERROR, { status, message });
    }
};

/**
 * Error message formatting utilities
 */
export const MessageFormatters = {
    /**
     * Format error for user display
     */
    forUser: (error, context = {}) => {
        return errorHandler.formatDiscordMessage(error, context);
    },

    /**
     * Format error for logging
     */
    forLog: (error, context = {}) => {
        const errorInfo = errorHandler.extractErrorInfo(error);
        return `[${errorInfo.code}] ${errorInfo.message} ${context.guildId ? `(Guild: ${context.guildId})` : ''}`;
    },

    /**
     * Format error for debugging
     */
    forDebug: (error, context = {}) => {
        const errorInfo = errorHandler.extractErrorInfo(error);
        return {
            code: errorInfo.code,
            message: errorInfo.message,
            name: errorInfo.name,
            details: errorInfo.details,
            context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
    }
};

/**
 * Helper function to format duration
 */
function formatDuration(seconds) {
    if (typeof seconds !== 'number') return 'Unknown';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
        return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    return `${remainingSeconds}s`;
}

/**
 * Error recovery utilities
 */
export const ErrorRecovery = {
    /**
     * Retry function with exponential backoff
     */
    retry: async (fn, maxRetries = 3, delay = 1000) => {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (!ErrorUtils.isRetryable(error) || i === maxRetries - 1) {
                    throw error;
                }
                
                const waitTime = delay * Math.pow(2, i);
                console.log(`[ErrorRecovery] Retry ${i + 1}/${maxRetries} in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        throw lastError;
    },

    /**
     * Fallback function execution
     */
    withFallback: async (primaryFn, fallbackFn) => {
        try {
            return await primaryFn();
        } catch (error) {
            console.log(`[ErrorRecovery] Primary function failed, using fallback: ${error.message}`);
            return await fallbackFn();
        }
    }
};
