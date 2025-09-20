// errors/error-handler.js
// Centralized Error Handler

import { ErrorCodes } from './error-codes.js';
import { ErrorMessages } from './error-messages.js';

export class ErrorHandler {
    constructor() {
        this.errorLog = new Map();
        this.errorCounts = new Map();
    }

    /**
     * Handle and log errors with context
     */
    handleError(error, context = {}) {
        const errorInfo = this.extractErrorInfo(error);
        const logEntry = {
            ...errorInfo,
            context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };

        // Log to console
        this.logError(logEntry);

        // Store in memory for analysis
        this.storeError(errorInfo.code, logEntry);

        return logEntry;
    }

    /**
     * Extract error information
     */
    extractErrorInfo(error) {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                code: error.code || 'UNKNOWN_ERROR',
                details: error.details || null
            };
        }

        return {
            name: 'UnknownError',
            message: String(error),
            code: 'UNKNOWN_ERROR',
            details: null
        };
    }

    /**
     * Log error to console with appropriate level
     */
    logError(errorInfo) {
        const { code, message, context } = errorInfo;
        const contextStr = context.guildId ? `[Guild: ${context.guildId}]` : '';
        
        if (this.isCriticalError(code)) {
            console.error(`[ERROR] ${code} ${contextStr}: ${message}`);
        } else if (this.isWarningError(code)) {
            console.warn(`[WARN] ${code} ${contextStr}: ${message}`);
        } else {
            console.log(`[INFO] ${code} ${contextStr}: ${message}`);
        }
    }

    /**
     * Store error for analysis
     */
    storeError(code, errorInfo) {
        if (!this.errorLog.has(code)) {
            this.errorLog.set(code, []);
        }
        
        this.errorLog.get(code).push(errorInfo);
        
        // Keep only last 100 errors per code
        const errors = this.errorLog.get(code);
        if (errors.length > 100) {
            errors.splice(0, errors.length - 100);
        }

        // Update error counts
        this.errorCounts.set(code, (this.errorCounts.get(code) || 0) + 1);
    }

    /**
     * Check if error is critical
     */
    isCriticalError(code) {
        const criticalCodes = [
            'SYSTEM_7001', // Memory limit exceeded
            'DATABASE_6001', // Database connection failed
            'SESSION_2002', // Session creation failed
            'MEDIA_1013' // yt-dlp binary not found
        ];
        return criticalCodes.includes(code);
    }

    /**
     * Check if error is a warning
     */
    isWarningError(code) {
        const warningCodes = [
            'NETWORK_5003', // API rate limited
            'QUEUE_3002', // Song already in queue
            'VALIDATION_4004' // Invalid query
        ];
        return warningCodes.includes(code);
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
            errorCounts: Object.fromEntries(this.errorCounts),
            recentErrors: Array.from(this.errorLog.entries()).map(([code, errors]) => ({
                code,
                count: errors.length,
                lastOccurrence: errors[errors.length - 1]?.timestamp
            }))
        };
    }

    /**
     * Clear error logs
     */
    clearErrorLogs() {
        this.errorLog.clear();
        this.errorCounts.clear();
    }

    /**
     * Get user-friendly error message
     */
    getUserFriendlyMessage(error) {
        const errorInfo = this.extractErrorInfo(error);
        const baseMessage = ErrorMessages[errorInfo.code] || errorInfo.message;

        // Add context-specific messages
        if (errorInfo.code === 'MEDIA_1005' || errorInfo.code === 'MEDIA_1006') {
            return `${baseMessage}. This song may be unavailable or restricted.`;
        }

        if (errorInfo.code === 'NETWORK_5003') {
            return `${baseMessage}. Please try again in a few moments.`;
        }

        if (errorInfo.code === 'SESSION_2004') {
            return `${baseMessage}. Please check bot permissions.`;
        }

        return baseMessage;
    }

    /**
     * Format error for Discord messages
     */
    formatDiscordMessage(error, context = {}) {
        const userMessage = this.getUserFriendlyMessage(error);
        const errorInfo = this.extractErrorInfo(error);
        
        let message = `❌ ${userMessage}`;
        
        if (context.songTitle) {
            message = `❌ Failed to process **${context.songTitle}**: ${userMessage}`;
        }
        
        return message;
    }
}
