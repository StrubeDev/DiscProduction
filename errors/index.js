// errors/index.js
// Centralized Error Management System

import { ErrorCodes } from './error-codes.js';
import { ErrorMessages } from './error-messages.js';
import { ErrorHandler } from './error-handler.js';

/**
 * Custom Error Classes
 */
export class DiscordMusicError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'DiscordMusicError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

export class MediaProcessingError extends DiscordMusicError {
    constructor(code, message, details = null) {
        super(code, message, details);
        this.name = 'MediaProcessingError';
    }
}

export class SessionError extends DiscordMusicError {
    constructor(code, message, details = null) {
        super(code, message, details);
        this.name = 'SessionError';
    }
}

export class QueueError extends DiscordMusicError {
    constructor(code, message, details = null) {
        super(code, message, details);
        this.name = 'QueueError';
    }
}

export class ValidationError extends DiscordMusicError {
    constructor(code, message, details = null) {
        super(code, message, details);
        this.name = 'ValidationError';
    }
}

export class NetworkError extends DiscordMusicError {
    constructor(code, message, details = null) {
        super(code, message, details);
        this.name = 'NetworkError';
    }
}

/**
 * Error Factory Functions
 */
export const createError = {
    media: (code, details = null) => new MediaProcessingError(code, ErrorMessages[code], details),
    session: (code, details = null) => new SessionError(code, ErrorMessages[code], details),
    queue: (code, details = null) => new QueueError(code, ErrorMessages[code], details),
    validation: (code, details = null) => new ValidationError(code, ErrorMessages[code], details),
    network: (code, details = null) => new NetworkError(code, ErrorMessages[code], details),
    generic: (code, details = null) => new DiscordMusicError(code, ErrorMessages[code], details)
};

/**
 * Error Handler Instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Convenience Functions
 */
export const throwError = {
    media: (code, details = null) => { throw createError.media(code, details); },
    session: (code, details = null) => { throw createError.session(code, details); },
    queue: (code, details = null) => { throw createError.queue(code, details); },
    validation: (code, details = null) => { throw createError.validation(code, details); },
    network: (code, details = null) => { throw createError.network(code, details); },
    generic: (code, details = null) => { throw createError.generic(code, details); }
};

/**
 * Error Code Constants
 */
export { ErrorCodes };

/**
 * Error Message Constants
 */
export { ErrorMessages };

/**
 * Error Utilities - Imported separately to avoid circular dependencies
 */
// Note: Import these directly from error-utils.js to avoid circular imports

/**
 * Default Export
 */
export default {
    ErrorCodes,
    ErrorMessages,
    errorHandler,
    createError,
    throwError,
    DiscordMusicError,
    MediaProcessingError,
    SessionError,
    QueueError,
    ValidationError,
    NetworkError
};
