# Error System Migration Guide

## Overview
This guide explains how to migrate from hardcoded error messages to the new centralized error management system.

## New Error System Structure

```
errors/
├── index.js              # Main exports and error classes
├── error-codes.js        # Centralized error code constants
├── error-messages.js     # Centralized error messages
├── error-handler.js      # Error handling and logging
├── error-utils.js        # Utility functions and helpers
└── MIGRATION_GUIDE.md    # This file
```

## Key Changes

### 1. Error Codes
- **Before**: `throw new Error('Failed to process media content')`
- **After**: `throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_PROCESS, { details })`

### 2. Error Messages
- **Before**: Hardcoded strings scattered throughout code
- **After**: Centralized in `error-messages.js` with consistent formatting

### 3. Error Handling
- **Before**: Inconsistent error logging and user messaging
- **After**: Centralized error handler with context-aware logging

## Migration Steps

### Step 1: Import Error System
```javascript
// Add to file imports
import { createError, throwError, ErrorCodes, MessageFormatters, errorHandler } from '../../errors/index.js';
```

### Step 2: Replace Error Throwing
```javascript
// OLD
if (!trackDetails) {
    throw new Error('Failed to fetch Spotify track details');
}

// NEW
if (!trackDetails) {
    throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_GET_VIDEO_INFO, { spotifyUrl });
}
```

### Step 3: Replace Error Messages
```javascript
// OLD
const errorMessage = `Failed to process **${songTitle}**. ${error.message.includes('Error code: 101') ? 'This song may be unavailable.' : 'Please try again.'}`;

// NEW
const errorMessage = MessageFormatters.forUser(error, { songTitle });
```

### Step 4: Add Error Logging
```javascript
// OLD
console.error(`[Handler] Error:`, error.message);

// NEW
errorHandler.handleError(error, { guildId, context });
```

## Error Categories

### Media Processing Errors (1000-1999)
- `MEDIA_1001`: Failed to process media content
- `MEDIA_1002`: Invalid or unsupported URL format
- `MEDIA_1004`: Duration limit exceeded
- `MEDIA_1005`: Video unavailable or removed
- `MEDIA_1006`: Video restricted or private

### Session Errors (2000-2999)
- `SESSION_2001`: No active audio session found
- `SESSION_2002`: Failed to create audio session
- `SESSION_2003`: Failed to establish voice connection
- `SESSION_2004`: Insufficient permissions

### Queue Errors (3000-3999)
- `QUEUE_3001`: Queue is full
- `QUEUE_3002`: Song already in queue
- `QUEUE_3003`: Queue is empty

### Validation Errors (4000-4999)
- `VALIDATION_4001`: Invalid guild ID
- `VALIDATION_4004`: Invalid query string
- `VALIDATION_4005`: Invalid Spotify URL format

### Network Errors (5000-5999)
- `NETWORK_5001`: Request timeout
- `NETWORK_5003`: API rate limit exceeded
- `NETWORK_5010`: Discord API error

## Usage Examples

### Creating Errors
```javascript
// Media processing error
throwError.media(ErrorCodes.MEDIA_PROCESSING.DURATION_LIMIT_EXCEEDED, { duration: 300, limit: 180 });

// Session error
throwError.session(ErrorCodes.SESSION.NO_ACTIVE_SESSION, { guildId });

// Validation error
throwError.validation(ErrorCodes.VALIDATION.INVALID_SPOTIFY_URL, { url });
```

### Error Handling
```javascript
try {
    // Some operation
} catch (error) {
    errorHandler.handleError(error, { guildId, operation: 'playSong' });
    const userMessage = MessageFormatters.forUser(error, { songTitle });
    await sendErrorMessage(interactionDetails, userMessage);
    throw error;
}
```

### Error Utilities
```javascript
// Check error type
if (ErrorUtils.isMediaError(error)) {
    // Handle media error
}

// Check if retryable
if (ErrorUtils.isRetryable(error)) {
    // Retry logic
}

// Wrap function with error handling
const safeFunction = ErrorWrappers.withErrorHandling(riskyFunction, { guildId });
```

## Benefits

1. **Consistency**: All errors use the same format and structure
2. **Maintainability**: Error messages centralized in one place
3. **Debugging**: Better error logging with context
4. **User Experience**: Consistent, user-friendly error messages
5. **Monitoring**: Error statistics and tracking
6. **Type Safety**: Structured error codes prevent typos

## Files Updated

- ✅ `handlers/media/spotify-track.js`
- ✅ `handlers/core/unified-media-handler.js`
- ✅ `handlers/media/youtube-track.js`
- 🔄 `utils/processors/unified-ytdlp-service.js` (in progress)
- 🔄 `handlers/common/audio-session.js` (pending)
- 🔄 `utils/services/queue-manager.js` (pending)
- 🔄 All other handler files (pending)

## Next Steps

1. Continue migrating remaining files
2. Update error handling in service files
3. Test error system with various scenarios
4. Add error monitoring and alerting
5. Create error recovery strategies
