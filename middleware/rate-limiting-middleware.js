const rateLimit = new Map();
const COOLDOWN_SECONDS = 30;

/**
 * Clean up rate limiting data for a specific guild
 */
export function cleanupGuildRateLimit(guildId) {
    if (rateLimit.has(guildId)) {
        rateLimit.delete(guildId);
        console.log(`[RateLimiting] 🧹 Cleaned up rate limit data for guild ${guildId}`);
    }
}

/**
 * Clean up old rate limiting data to prevent memory leaks
 */
export function cleanupOldRateLimitData() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    let cleanedCount = 0;
    
    for (const [guildId, timestamp] of rateLimit) {
        if (now - timestamp > maxAge) {
            rateLimit.delete(guildId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[RateLimiting] 🧹 Cleaned up ${cleanedCount} old rate limit entries`);
    }
}
const MAX_REQUESTS = 3;

export async function rateLimitCheck(guildId) {
    const now = Date.now();
    const usageTimestamps = rateLimit.get(guildId) || [];
    
    // Clean up expired timestamps first
    const validTimestamps = usageTimestamps.filter(timestamp => {
        const age = now - timestamp;
        return age < (COOLDOWN_SECONDS * 1000);
    });

    // If we already have MAX_REQUESTS within the window, deny the request
    if (validTimestamps.length >= MAX_REQUESTS) {
        const oldestTimestamp = validTimestamps[0];
        const remainingCooldown = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - oldestTimestamp)) / 1000);
        console.log(`DENIED - Guild ${guildId} has ${validTimestamps.length} recent requests. Next slot in ${remainingCooldown}s`);
        console.log(`Timestamps: ${validTimestamps.map(t => new Date(t).toISOString())}`);
        return false;
    }

    // Allow the request and add the new timestamp
    validTimestamps.push(now);
    rateLimit.set(guildId, validTimestamps);
    console.log(`ALLOWED - Guild ${guildId} now has ${validTimestamps.length}/${MAX_REQUESTS} requests`);
    console.log(`Timestamps: ${validTimestamps.map(t => new Date(t).toISOString())}`);
    return true;
}