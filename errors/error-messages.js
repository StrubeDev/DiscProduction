// errors/error-messages.js
// Centralized Error Messages

export const ErrorMessages = {
    // Media Processing Error Messages
    'MEDIA_1001': 'Failed to process media content',
    'MEDIA_1002': 'Invalid or unsupported URL format',
    'MEDIA_1003': 'Unsupported media format',
    'MEDIA_1004': 'Duration limit exceeded',
    'MEDIA_1005': 'Video is unavailable or has been removed',
    'MEDIA_1006': 'Video is restricted or private',
    'MEDIA_1007': 'No video ID found in URL',
    'MEDIA_1008': 'Failed to retrieve video information',
    'MEDIA_1009': 'Failed to download media content',
    'MEDIA_1010': 'Failed to process audio stream',
    'MEDIA_1011': 'Preloaded file not found',
    'MEDIA_1012': 'Media processing timeout',
    'MEDIA_1013': 'yt-dlp binary not found',

    // Session Error Messages
    'SESSION_2001': 'No active audio session found',
    'SESSION_2002': 'Failed to create audio session',
    'SESSION_2003': 'Failed to establish voice connection',
    'SESSION_2004': 'Insufficient permissions for voice channel',
    'SESSION_2005': 'Voice channel not found',
    'SESSION_2006': 'User not found in guild',
    'SESSION_2007': 'Bot is not in a voice channel',
    'SESSION_2008': 'Invalid voice state',
    'SESSION_2009': 'Session already exists',
    'SESSION_2010': 'Failed to cleanup session resources',
    'SESSION_2011': 'User is not in a voice channel',

    // Queue Error Messages
    'QUEUE_3001': 'Queue is full',
    'QUEUE_3002': 'Song is already in queue',
    'QUEUE_3003': 'Queue is empty',
    'QUEUE_3004': 'Invalid queue position',
    'QUEUE_3005': 'Failed to add song to queue',
    'QUEUE_3006': 'Failed to remove song from queue',
    'QUEUE_3007': 'Failed to clear queue',
    'QUEUE_3008': 'Failed to preload song',

    // Validation Error Messages
    'VALIDATION_4001': 'Invalid guild ID',
    'VALIDATION_4002': 'Invalid channel ID',
    'VALIDATION_4003': 'Invalid user ID',
    'VALIDATION_4004': 'Invalid query string',
    'VALIDATION_4005': 'Invalid Spotify URL format',
    'VALIDATION_4006': 'Invalid YouTube URL format',
    'VALIDATION_4007': 'Invalid playlist URL format',
    'VALIDATION_4008': 'Missing required field',
    'VALIDATION_4009': 'Invalid duration value',
    'VALIDATION_4010': 'Invalid volume level',
    'VALIDATION_4011': '❌ Please enter a song name or URL.',
    'VALIDATION_4012': '❌ **Error**: Failed to process song request',
    'VALIDATION_4013': '❌ An error occurred while processing your song request.',

    // Network Error Messages
    'NETWORK_5001': 'Request timeout',
    'NETWORK_5002': 'Connection failed',
    'NETWORK_5003': 'API rate limit exceeded',
    'NETWORK_5004': 'API service unavailable',
    'NETWORK_5005': 'Invalid API response',
    'NETWORK_5006': 'Authentication failed',
    'NETWORK_5007': 'Permission denied',
    'NETWORK_5008': 'Resource not found',
    'NETWORK_5009': 'Server error',
    'NETWORK_5010': 'Discord API error',

    // Database Error Messages
    'DATABASE_6001': 'Database connection failed',
    'DATABASE_6002': 'Database query failed',
    'DATABASE_6003': 'Database transaction failed',
    'DATABASE_6004': 'Record not found',
    'DATABASE_6005': 'Duplicate record',
    'DATABASE_6006': 'Database constraint violation',
    'DATABASE_6007': 'Database migration failed',

    // System Error Messages
    'SYSTEM_7001': 'Memory limit exceeded',
    'SYSTEM_7002': 'File system error',
    'SYSTEM_7003': 'Process creation failed',
    'SYSTEM_7004': 'Process termination failed',
    'SYSTEM_7005': 'Temporary file cleanup failed',
    'SYSTEM_7006': 'Resource cleanup failed',
    'SYSTEM_7007': 'Configuration error',
    'SYSTEM_7008': 'Environment variable error',

    // Discord API Error Messages
    'DISCORD_8001': 'Unknown message',
    'DISCORD_8002': 'Unknown channel',
    'DISCORD_8003': 'Unknown guild',
    'DISCORD_8004': 'Unknown user',
    'DISCORD_8005': 'Missing permissions',
    'DISCORD_8006': 'Invalid form body',
    'DISCORD_8007': 'Interaction expired',
    'DISCORD_8008': 'Interaction already acknowledged',
    'DISCORD_8009': 'Webhook not found',
    'DISCORD_8010': 'Webhook expired'
};
