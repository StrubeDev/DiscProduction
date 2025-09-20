/**
 * State Lock Manager
 * Handles state locking, priority queues, and rate limiting for concurrent state changes
 */
export class StateLockManager {
    static stateLocks = new Map();
    static stateQueues = new Map();
    static rateLimits = new Map();
    
    // Configuration
    static RATE_LIMIT_WINDOW = 10 * 1000; // 10 seconds
    static MAX_REQUESTS_PER_WINDOW = 10; // Allow more requests
    static QUEUE_TIMEOUT = 60 * 1000; // 60 seconds
    
    // Priority levels
    static PRIORITY = {
        CRITICAL: 0,  // Bot shutdown, emergency stops
        HIGH: 1,      // Admin commands (skip, stop, reset)
        NORMAL: 2,    // Regular user commands (play, pause)
        LOW: 3        // Background tasks, cleanup
    };

    /**
     * Check if a state change is allowed based on current lock and priority
     */
    static isStateChangeAllowed(guildId, newStateType, priority = this.PRIORITY.NORMAL, userId = null) {
        const currentLock = this.stateLocks.get(guildId);
        if (!currentLock) return true;
        
        // Check if new request has higher priority than current lock
        if (priority < currentLock.priority) {
            console.log(`[StateLockManager] 🔒 Higher priority request: ${priority} < ${currentLock.priority}, allowing override`);
            return true;
        }
        
        // Check allowed transitions
        const allowedTransitions = {
            'querying': ['loading', 'idle'],
            'loading': ['playing', 'idle'],
            'playing': ['idle'],
            'idle': ['querying', 'loading', 'idle'] // Allow idle → idle for state refreshes
        };
        
        const allowed = allowedTransitions[currentLock.currentState]?.includes(newStateType) || false;
        console.log(`[StateLockManager] 🔒 State lock check: ${currentLock.currentState} → ${newStateType} (priority: ${priority}): ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
        
        return allowed;
    }

    /**
     * Lock a state with priority
     */
    static lockState(guildId, stateType, priority = this.PRIORITY.NORMAL, userId = null) {
        this.stateLocks.set(guildId, {
            currentState: stateType,
            priority,
            userId,
            timestamp: Date.now()
        });
        console.log(`[StateLockManager] 🔒 State locked: ${stateType} (priority: ${priority}, user: ${userId}) for guild ${guildId}`);
    }

    /**
     * Unlock a state
     */
    static unlockState(guildId) {
        this.stateLocks.delete(guildId);
        console.log(`[StateLockManager] 🔓 State unlocked for guild ${guildId}`);
        
        // Process any queued requests
        this.processQueue(guildId);
    }

    /**
     * Queue a state change request
     */
    static queueStateChange(guildId, stateType, priority = this.PRIORITY.NORMAL, userId = null, data = null) {
        if (!this.stateQueues.has(guildId)) {
            this.stateQueues.set(guildId, []);
        }
        
        const queue = this.stateQueues.get(guildId);
        const request = {
            stateType,
            priority,
            userId,
            data,
            timestamp: Date.now()
        };
        
        // Insert based on priority (lower number = higher priority)
        const insertIndex = queue.findIndex(req => req.priority > priority);
        if (insertIndex === -1) {
            queue.push(request);
        } else {
            queue.splice(insertIndex, 0, request);
        }
        
        console.log(`[StateLockManager] 📋 Queued state change: ${stateType} (priority: ${priority}, user: ${userId}) for guild ${guildId}`);
        
        // Set timeout to process queue
        setTimeout(() => this.processQueue(guildId), 100);
    }

    /**
     * Process queued state changes
     */
    static async processQueue(guildId) {
        const queue = this.stateQueues.get(guildId);
        if (!queue || queue.length === 0) return;
        
        const request = queue.shift();
        if (!request) return;
        
        // Check if request is still valid (not expired)
        if (Date.now() - request.timestamp > this.QUEUE_TIMEOUT) {
            console.log(`[StateLockManager] ⏰ Queued request expired for guild ${guildId}`);
            this.processQueue(guildId); // Process next request
            return;
        }
        
        // Check if state change is now allowed
        if (this.isStateChangeAllowed(guildId, request.stateType, request.priority, request.userId)) {
            console.log(`[StateLockManager] ✅ Processing queued request: ${request.stateType} for guild ${guildId}`);
            
            // Import and trigger the state change
            const { StateCoordinator } = await import('./state-coordinator.js');
            await StateCoordinator.notifyStateChange(guildId, request.stateType, request.data);
        } else {
            // Put request back in queue
            queue.unshift(request);
            console.log(`[StateLockManager] ⏳ Queued request still blocked, waiting...`);
        }
    }

    /**
     * Rate limiting check
     */
    static async rateLimitCheck(guildId, userId = null, stateType = null) {
        // Skip rate limiting for legitimate state transitions
        if (stateType === 'idle' || stateType === 'loading' || stateType === 'playing') {
            return true;
        }
        
        const now = Date.now();
        const key = userId ? `${guildId}:${userId}` : guildId;
        const usageData = this.rateLimits.get(key) || { timestamps: [], count: 0 };
        
        // Clean up expired timestamps
        const validTimestamps = usageData.timestamps.filter(timestamp => {
            return now - timestamp < this.RATE_LIMIT_WINDOW;
        });
        
        // Check if rate limit exceeded
        if (validTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
            const oldestTimestamp = validTimestamps[0];
            const remainingCooldown = Math.ceil((this.RATE_LIMIT_WINDOW - (now - oldestTimestamp)) / 1000);
            console.log(`[StateLockManager] 🚫 Rate limit exceeded for ${key}. Next slot in ${remainingCooldown}s`);
            return false;
        }
        
        // Allow request and update rate limit data
        validTimestamps.push(now);
        this.rateLimits.set(key, {
            timestamps: validTimestamps,
            count: validTimestamps.length
        });
        
        console.log(`[StateLockManager] ✅ Rate limit check passed for ${key} (${validTimestamps.length}/${this.MAX_REQUESTS_PER_WINDOW})`);
        return true;
    }

    /**
     * Get user permission level for priority assignment
     */
    static getUserPriority(userId, guildId) {
        // This would integrate with your permission system
        // For now, return NORMAL priority
        // TODO: Check if user is admin, moderator, etc.
        return this.PRIORITY.NORMAL;
    }

    /**
     * Clean up old data to prevent memory leaks
     */
    static cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // Clean up expired rate limits
        for (const [key, data] of this.rateLimits) {
            if (now - data.timestamps[0] > this.RATE_LIMIT_WINDOW * 2) {
                this.rateLimits.delete(key);
                cleanedCount++;
            }
        }
        
        // Clean up expired queue items
        for (const [guildId, queue] of this.stateQueues) {
            const validRequests = queue.filter(req => 
                now - req.timestamp < this.QUEUE_TIMEOUT
            );
            
            if (validRequests.length !== queue.length) {
                this.stateQueues.set(guildId, validRequests);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[StateLockManager] 🧹 Cleaned up ${cleanedCount} expired entries`);
        }
    }

    /**
     * Get current lock status for a guild
     */
    static getLockStatus(guildId) {
        const lock = this.stateLocks.get(guildId);
        const queue = this.stateQueues.get(guildId) || [];
        
        return {
            isLocked: !!lock,
            currentState: lock?.currentState || null,
            priority: lock?.priority || null,
            userId: lock?.userId || null,
            queueLength: queue.length,
            queue: queue.map(req => ({
                stateType: req.stateType,
                priority: req.priority,
                userId: req.userId,
                age: Date.now() - req.timestamp
            }))
        };
    }
}
