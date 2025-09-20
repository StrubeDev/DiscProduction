// utils/processing-locks.js
// Shared processing locks to prevent race conditions between different track handlers

const guildProcessingLocks = new Map();

export function isGuildLocked(guildId) {
    return guildProcessingLocks.get(guildId) || false;
}

export function acquireGuildLock(guildId) {
    if (guildProcessingLocks.get(guildId)) {
        return false; // Already locked
    }
    guildProcessingLocks.set(guildId, Date.now());
    return true; // Successfully acquired lock
}

export function releaseGuildLock(guildId) {
    guildProcessingLocks.delete(guildId);
}

export function debugLocks() {
    return Array.from(guildProcessingLocks.entries());
}

// Add timeout to prevent deadlocks
let deadlockCheckTimer = setInterval(() => {
    const now = Date.now();
    for (const [guildId, lockTime] of guildProcessingLocks.entries()) {
        if (now - lockTime > 60000) { // 60 second timeout
            console.warn(`[ProcessingLock] Force releasing stale lock for guild ${guildId}`);
            guildProcessingLocks.delete(guildId);
        }
    }
}, 30000); // Check every 30 seconds

// Export cleanup function
export function stopDeadlockCheck() {
    if (deadlockCheckTimer) {
        clearInterval(deadlockCheckTimer);
        deadlockCheckTimer = null;
        console.log('[ProcessingLock] Stopped deadlock check timer');
    }
}
