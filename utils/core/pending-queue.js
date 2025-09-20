// utils/pending-queue.js
// Shared pending queue system for songs added before session exists or when locked

const guildPendingQueues = new Map();

/**
 * Clean up pending queue data for a specific guild
 */
export function cleanupGuildPendingQueue(guildId) {
    if (guildPendingQueues.has(guildId)) {
        guildPendingQueues.delete(guildId);
        console.log(`[PendingQueue] 🧹 Cleaned up pending queue data for guild ${guildId}`);
    }
}

/**
 * Clean up old pending queue data to prevent memory leaks
 */
export function cleanupOldPendingQueues() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    let cleanedCount = 0;
    
    for (const [guildId, data] of guildPendingQueues) {
        if (now - data.timestamp > maxAge) {
            guildPendingQueues.delete(guildId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[PendingQueue] 🧹 Cleaned up ${cleanedCount} old pending queue entries`);
    }
}

export function hasPendingQueue(guildId) {
    return guildPendingQueues.has(guildId) && guildPendingQueues.get(guildId).length > 0;
}

export function addToPendingQueue(guildId, songObject) {
    if (!guildPendingQueues.has(guildId)) {
        guildPendingQueues.set(guildId, []);
    }
    
    guildPendingQueues.get(guildId).push(songObject);
    const queueLength = guildPendingQueues.get(guildId).length;
    
    console.log(`[PendingQueue] Added "${songObject.title}" to pending queue for guild ${guildId}. Pending queue length: ${queueLength}`);
    return queueLength;
}

export function getPendingQueue(guildId) {
    return guildPendingQueues.get(guildId) || [];
}

export async function transferPendingQueue(guildId, session, djsClient) {
    if (!guildPendingQueues.has(guildId)) {
        return 0;
    }
    
    const pendingSongs = guildPendingQueues.get(guildId);
    if (pendingSongs.length === 0) {
        guildPendingQueues.delete(guildId);
        return 0;
    }
    
    // CRITICAL FIX: Enforce 3-song limit when transferring from pending queue
    const maxInMemory = 3;
    const currentQueueLength = session.queue.length;
    const totalSongs = currentQueueLength + pendingSongs.length;
    
    if (totalSongs > maxInMemory) {
        // Large queue - use lazy loading strategy
        console.log(`[PendingQueue] Large queue detected (${totalSongs} songs), using lazy loading strategy`);
        
        // Keep only 3 songs in memory total
        const songsToKeepInMemory = Math.min(maxInMemory, totalSongs);
        const songsToMoveToDatabase = totalSongs - songsToKeepInMemory;
        
        // Add all pending songs to session queue first
        session.queue.push(...pendingSongs);
        
        // Move excess songs to database (proper lazy loading)
        if (songsToMoveToDatabase > 0) {
            const songsToMove = session.queue.splice(songsToKeepInMemory);
            console.log(`[PendingQueue] Moving ${songsToMove.length} songs to database, keeping ${songsToKeepInMemory} in memory`);
            
            // Store in database for lazy loading
            try {
                const { saveGuildQueue, getGuildQueue } = await import('../database/guildQueues.js');
                const existingData = await getGuildQueue(guildId);
                
                await saveGuildQueue(guildId, {
                    ...existingData,
                    queue: songsToMove,
                    lazyLoadInfo: {
                        inMemoryCount: session.queue.length,
                        totalCount: totalSongs,
                        lastUpdated: Date.now()
                    }
                });
                
                console.log(`[PendingQueue] ✅ Stored ${songsToMove.length} songs in database for lazy loading`);
            } catch (error) {
                console.error(`[PendingQueue] ❌ Failed to store songs in database:`, error.message);
                // If database storage fails, put songs back in memory as fallback
                session.queue.push(...songsToMove);
                console.log(`[PendingQueue] Fallback: Put ${songsToMove.length} songs back in memory`);
            }
        }
        
        // Set up lazy loading info
        session.lazyLoadInfo = {
            inMemoryCount: session.queue.length,
            totalCount: totalSongs,
            lastUpdated: Date.now()
        };
        
        console.log(`[PendingQueue] Set up lazy loading: ${session.lazyLoadInfo.inMemoryCount} in memory, ${session.lazyLoadInfo.totalCount} total`);
    } else {
        // Small queue - add all songs to memory
        session.queue.push(...pendingSongs);
        console.log(`[PendingQueue] Transferred ${pendingSongs.length} pending songs to session queue for guild ${guildId}. Queue length: ${session.queue.length}`);
        
        // Set up lazy loading info for consistency
        if (!session.lazyLoadInfo) {
            session.lazyLoadInfo = {
                inMemoryCount: session.queue.length,
                totalCount: session.queue.length,
                lastUpdated: Date.now()
            };
        } else {
            session.lazyLoadInfo.totalCount = session.queue.length;
            session.lazyLoadInfo.inMemoryCount = session.queue.length;
            session.lazyLoadInfo.lastUpdated = Date.now();
        }
    }
    
    // FIXED: Don't emit queueChanged here - let the main handlers emit it
    // This prevents duplicate events that cause multiple preloads
    
    // Clear the pending queue
    guildPendingQueues.delete(guildId);
    
    return pendingSongs.length;
}

export function clearPendingQueue(guildId) {
    const hadQueue = guildPendingQueues.has(guildId);
    guildPendingQueues.delete(guildId);
    if (hadQueue) {
        console.log(`[PendingQueue] Cleared pending queue for guild ${guildId}`);
    }
    return hadQueue;
}

export function getPendingQueueLength(guildId) {
    return guildPendingQueues.get(guildId)?.length || 0;
}
