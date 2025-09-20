import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection
} from '@discordjs/voice';
import { ErrorMessages } from '../../errors/index.js';
import fs from 'fs';
import { PermissionFlagsBits } from 'discord.js';
import { guildAudioSessions, getExistingSession, hasValidSession } from '../../utils/core/audio-state.js';
import { playerStateManager } from '../../utils/core/player-state-manager.js';
import { startOrResetVoiceTimeout } from '../../utils/timeout/voice-timeouts.js';

// Simple voice connection management
export async function getOrCreateVoiceConnection(djsClient, guildId, member, retryCount = 0) {
    const maxRetries = 2;
    let connection = getVoiceConnection(guildId);
    
    // Check if we need to move to a different voice channel
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        // CRITICAL: Stop any playing audio before reconnecting to prevent multiple streams
        const existingSession = guildAudioSessions.get(guildId);
        if (existingSession && existingSession.player) {
            console.log(`[VoiceConnection] Stopping existing audio before reconnecting to prevent multiple streams`);
            existingSession.player.stop(true);
        }
        
        // Get the user's current voice channel
        let userVoiceChannelId = null;
        if (member?.voice?.channel?.id) {
            userVoiceChannelId = member.voice.channel.id;
        } else if (member?.user?.id) {
            // Try to fetch fresh member data to get current voice channel
            try {
                const guild = await djsClient.guilds.fetch(guildId);
                const freshMember = await guild.members.fetch(member.user.id);
                userVoiceChannelId = freshMember?.voice?.channel?.id;
            } catch (error) {
                console.warn(`[VoiceConnection] Could not fetch user voice state:`, error.message);
            }
        }
        
        // Only disconnect if user is in a different voice channel
        if (userVoiceChannelId && connection.joinConfig.channelId !== userVoiceChannelId) {
            console.log(`[VoiceConnection] User moved to different voice channel, disconnecting from ${connection.joinConfig.channelId} to join ${userVoiceChannelId}`);
            connection.destroy();
            connection = null;
        } else if (userVoiceChannelId) {
            console.log(`[VoiceConnection] User is already in the same voice channel (${userVoiceChannelId}), reusing existing connection`);
            return { connection, error: null };
        } else {
            console.log(`[VoiceConnection] User is not in a voice channel, disconnecting from existing connection`);
            connection.destroy();
            connection = null;
        }
    }

    // DEBUG: Log member data to understand the structure
    console.log(`[VoiceConnection] DEBUG - member data:`, {
        hasUser: !!member?.user,
        userId: member?.user?.id,
        hasVoice: !!member?.voice,
        voiceChannelId: member?.voice?.channel?.id,
        memberKeys: member ? Object.keys(member) : 'no member'
    });

    // Try to fetch fresh member data if voice state is missing or incomplete
    if ((!member?.voice || !member?.voice?.channel) && member?.user?.id) {
        try {
            console.log(`[VoiceConnection] Voice state missing, fetching fresh member data for user ${member.user.id}`);
            const guild = await djsClient.guilds.fetch(guildId);
            const freshMember = await guild.members.fetch(member.user.id);
            console.log(`[VoiceConnection] Fresh member voice state:`, {
                hasVoice: !!freshMember?.voice,
                voiceChannelId: freshMember?.voice?.channel?.id,
                channelName: freshMember?.voice?.channel?.name
            });
            
            if (freshMember?.voice?.channel) {
                member = freshMember;
                console.log(`[VoiceConnection] Using fresh member data with voice channel`);
            } else if (freshMember?.voice) {
                // Voice state exists but channel is undefined - use the channelId directly
                console.log(`[VoiceConnection] Voice state exists but channel undefined, using channelId directly`);
                console.log(`[VoiceConnection] Voice state details:`, {
                    state: freshMember.voice.state,
                    channelId: freshMember.voice.channelId,
                    guildId: freshMember.voice.guildId
                });
                
                // Use the channelId from voice state to fetch the channel directly
                if (freshMember.voice.channelId) {
                    try {
                        console.log(`[VoiceConnection] Fetching channel ${freshMember.voice.channelId} from voice state`);
                        const channel = await guild.channels.fetch(freshMember.voice.channelId);
                        if (channel && channel.type === 2) {
                            console.log(`[VoiceConnection] ✅ Found channel: ${channel.name}`);
                            
                            // Create a proper member object that Discord.js can work with
                            // We need to ensure all Discord.js properties are preserved
                            member = {
                                ...freshMember,
                                voice: {
                                    ...freshMember.voice,
                                    channel: channel
                                }
                            };
                            console.log(`[VoiceConnection] ✅ Voice state reconstructed for: ${channel.name}`);
                        } else {
                            console.log(`[VoiceConnection] ❌ Channel ${freshMember.voice.channelId} is not a voice channel`);
                        }
                    } catch (channelError) {
                        console.warn(`[VoiceConnection] Failed to fetch channel ${freshMember.voice.channelId}:`, channelError.message);
                    }
                } else {
                    console.log(`[VoiceConnection] ❌ No channelId in voice state`);
                }
            }
        } catch (fetchError) {
            console.error(`[VoiceConnection] Failed to fetch fresh member data:`, fetchError.message);
        }
    }

    if (!member?.voice?.channel) {
        return { connection: null, error: ErrorMessages.SESSION_2011 };
    }

    const channel = member.voice.channel;
    
    // Debug: Check if we have a valid channel
    if (!channel || !channel.id) {
        console.error(`[VoiceConnection] Invalid channel object:`, channel);
        return { connection: null, error: 'Invalid voice channel' };
    }
    
    console.log(`[VoiceConnection] Using channel: ${channel.name} (${channel.id})`);
    
    // Try to get bot member from cache first, then fetch if needed
    let botMember;
    try {
        console.log(`[VoiceConnection] Client user check:`, {
            hasClient: !!djsClient,
            hasUser: !!djsClient?.user,
            userId: djsClient?.user?.id,
            clientReady: djsClient?.readyAt
        });
        
        // Get bot user ID - use stored value if djsClient.user is undefined
        const botUserId = djsClient.user?.id || process.env.BOT_USER_ID;
        if (!botUserId) {
            console.error(`[VoiceConnection] Bot user ID not available from client or environment`);
            return { connection: null, error: 'Bot user ID not available' };
        }
        
        const guild = await djsClient.guilds.fetch(guildId);
        
        // Try to get from cache first (preserves role data)
        botMember = guild.members.cache.get(botUserId);
        
        if (!botMember) {
            console.log(`[VoiceConnection] Bot member not in cache, fetching fresh`);
            botMember = await guild.members.fetch(botUserId);
        } else {
            console.log(`[VoiceConnection] Using cached bot member`);
        }
        
        console.log(`[VoiceConnection] Bot member: ${botMember.user.username}`);
        console.log(`[VoiceConnection] Bot member roles count: ${botMember.roles.cache.size}`);
    } catch (botFetchError) {
        console.error(`[VoiceConnection] Failed to fetch bot member:`, botFetchError.message);
        return { connection: null, error: 'Failed to fetch bot member' };
    }
    
    // Check permissions with error handling
    try {
        console.log(`[VoiceConnection] Checking permissions for bot in channel ${channel.name}`);
        console.log(`[VoiceConnection] Bot member roles:`, botMember?.roles?.cache?.size || 'undefined');
        console.log(`[VoiceConnection] Channel type:`, channel.type);
        
        const permissions = botMember?.permissionsIn(channel);
        if (!permissions) {
            console.error(`[VoiceConnection] permissionsIn returned undefined`);
            return { connection: null, error: 'Could not check permissions' };
        }
        
        const hasPermissions = permissions.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]);
        if (!hasPermissions) {
            console.log(`[VoiceConnection] Bot missing permissions in channel ${channel.name}`);
            return { connection: null, error: 'Missing voice channel permissions' };
        }
        console.log(`[VoiceConnection] Bot has required permissions in channel ${channel.name}`);
    } catch (permissionError) {
        console.error(`[VoiceConnection] Error checking permissions:`, permissionError.message);
        console.error(`[VoiceConnection] Permission error stack:`, permissionError.stack);
        return { connection: null, error: 'Error checking permissions' };
    }

    try {
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        console.log(`[VoiceConnection] Successfully connected to voice channel in guild ${guildId}`);
        return { connection, error: null };
    } catch (error) {
        console.error(`[VoiceConnection] Failed to connect:`, error);
        if (retryCount < maxRetries) {
            console.log(`[VoiceConnection] Retrying connection (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return getOrCreateVoiceConnection(djsClient, guildId, member, retryCount + 1);
        }
        return { connection: null, error: error.message };
    }
}

// Memory tracking for per-song cleanup
const songMemoryTracker = new Map(); // guildId -> { songTitle, startMemory, startRSS, startTime }

// RSS trend tracking to catch cumulative leaks
const rssTrendTracker = new Map(); // guildId -> { baselineRSS, songCount, totalRSSGrowth, lastCheck }

// Log that enhanced memory tracking is loaded
console.log(`[Memory] 🚀 Enhanced RSS memory tracking system loaded - Docker ENV: ${process.env.DOCKER_ENV || 'false'}`);

// Simple audio session management
export async function getOrCreateAudioSession(guildId, connection, channelId, djsClient, playNextInQueue) {
    let session = getExistingSession(guildId);
    
    if (session && session.player && session.connection) {
        console.log(`[AudioSession] Reusing existing session for guild ${guildId}`);
        
        // CRITICAL: Reset session state when reusing to ensure clean state
        console.log(`[AudioSession] 🔄 RESETTING SESSION STATE for reuse`);
        
        // Clear any stuck state flags
        const state = playerStateManager.getState(guildId);
        if (state) {
            state.discordStatus = 'idle';
            state.isPlaying = false;
            state.isPaused = false;
            state.isStarting = false;
            state.isBuffering = false;
            state.hasNowPlaying = false;
            state.nowPlaying = null;
            console.log(`[AudioSession] ✅ Session state reset for reuse`);
        }
        
        // CRITICAL: Ensure we're not creating duplicate players
        if (session.player.state.status !== 'idle') {
            console.log(`[AudioSession] WARNING: Existing player is active (${session.player.state.status}) - this could cause audio overlap`);
        }
        return session;
    }

    // SAFETY CHECK: If there's an existing session, clean it up first to prevent audio overlap
    if (session) {
        console.log(`[AudioSession] SAFETY: Cleaning up existing session before creating new one for guild ${guildId}`);
        try {
            // Stop any playing audio
            if (session.player) {
                session.player.stop(true);
            }
            // Clear the session from the map
            guildAudioSessions.delete(guildId);
        } catch (error) {
            console.error(`[AudioSession] Error cleaning up existing session:`, error.message);
        }
        session = null; // Reset session to create a fresh one
    }

    console.log(`[AudioSession] Creating new session for guild ${guildId}`);
    
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
        },
    });

    // Initialize state manager for this guild
    const state = playerStateManager.initializeGuildState(guildId, player);
    
    // Add debug logging for player state changes
    player.on('stateChange', (oldState, newState) => {
        console.log(`[AudioPlayer] 🔍 STATE CHANGE for guild ${guildId}: ${oldState.status} → ${newState.status}`);
        if (newState.status === 'idle') {
            console.log(`[AudioPlayer] 🔍 PLAYER WENT IDLE for guild ${guildId}`);
        }
        if (oldState.status === 'playing' && newState.status === 'idle') {
            console.log(`[AudioPlayer] 🔍 SONG FINISHED - Player went from playing to idle for guild ${guildId}`);
        }
    });
    
    session = {
        guildId,
        channelId,
        connection,
        player,
        queue: session?.queue || [],
        volume: session?.volume || 100,
        isMuted: false,
        playNextInQueue: playNextInQueue, // Store the callback function
        createdAt: new Date(),
        lastActivity: new Date(),
        
        // State is now managed by playerStateManager
        // These are getters that delegate to the state manager
        get isPlaying() { return playerStateManager.isPlaying(guildId); },
        get isPaused() { return playerStateManager.isPaused(guildId); },
        get isStarting() { return playerStateManager.isStarting(guildId); },
        get nowPlaying() { return playerStateManager.getNowPlaying(guildId); },
        get currentSong() { return playerStateManager.getNowPlaying(guildId); },
        get autoAdvanceQueue() { return state.autoAdvanceQueue; },
        set autoAdvanceQueue(value) { state.autoAdvanceQueue = value; }
    };

    // ATTACH EVENT LISTENERS ONLY ONCE PER SESSION
    if (!session.eventListenersAttached) {
        console.log(`[AudioSession] Attaching event listeners for guild ${guildId}`);
        console.log(`[AudioSession] 🔍 DEBUG: Player state before attaching listeners: ${player.state.status}`);
        console.log(`[AudioSession] 🔍 DEBUG: Player object:`, {
            hasOn: typeof player.on === 'function',
            hasState: !!player.state,
            stateStatus: player.state?.status
        });
        
        console.log(`[AudioSession] 🔍 DEBUG: About to attach AudioPlayerStatus.Idle listener`);
        
        // MINIMAL VOICE CONNECTION MONITORING: Only log critical issues, ignore normal fluctuations
        connection.on('stateChange', (oldState, newState) => {
            console.log(`[AudioSession] 🔍 Voice connection state change: ${oldState.status} → ${newState.status}`);
            // ONLY log and react to DESTROYED status - all other state changes are normal Discord behavior
            if (newState.status === VoiceConnectionStatus.Destroyed) {
                console.log(`[VoiceConnection] ❌ Connection destroyed for guild ${guildId} - performing cleanup`);
                
                // COMPREHENSIVE CLEANUP: When connection is truly destroyed, clean up everything
                setTimeout(async () => {
                    try {
                        await performComprehensiveStopCleanup(guildId, session, 'connection destroyed');
                        console.log(`[VoiceConnection] ✅ Comprehensive cleanup completed after connection destruction for guild ${guildId}`);
                    } catch (error) {
                        console.error(`[VoiceConnection] Error during comprehensive cleanup after connection destruction:`, error.message);
                    }
                }, 1000); // Small delay to let other cleanup finish first
            }
            // IGNORE ALL OTHER STATE CHANGES: ready->connecting, connecting->ready, etc. are normal Discord behavior
            // No need to log or react to these - they don't affect playback
        });

        // State management is now handled by playerStateManager
        // The old event listeners are removed since they conflict with the state manager

    // REMOVED: Direct idle event listener - now handled by state manager
    // The PlayerStateManager handles Discord events and notifies listeners
    // This prevents duplicate event processing and uses the proper state architecture
    
    // REMOVED: Debug log for idle listener - no longer using direct idle listener

    player.on('error', async (error) => {
        console.error(`[AudioPlayer] Player error in guild ${guildId}:`, error);
        playerStateManager.clearNowPlaying(guildId);
        playerStateManager.setLoading(guildId, false);
        
        // Clean up processes on error
        try {
            const { processManager } = await import('../../utils/services/process-manager.js');
            const activeProcesses = processManager.getGuildProcesses(guildId);
            console.log(`[AudioPlayer] Error cleanup: killing ${activeProcesses.length} processes for guild ${guildId}`);
            processManager.killGuildProcesses(guildId);
        } catch (cleanupError) {
            console.log(`[AudioPlayer] Error cleanup failed:`, cleanupError.message);
        }
    });
        
    // Mark event listeners as attached
    session.eventListenersAttached = true;
    
    // State changes are now handled by the StateCoordinator and EmbedUpdateService
    // The audio session just manages the audio player state, not UI updates
    
    // Initialize embed update service for this guild
    try {
        const { EmbedUpdateService } = await import('../../services/embed-update-service.js');
        await EmbedUpdateService.initialize();
        EmbedUpdateService.registerGuildListeners(guildId);
        console.log(`[AudioSession] ✅ Embed update service registered for guild ${guildId}`);
    } catch (error) {
        console.error(`[AudioSession] ❌ Failed to initialize embed update service:`, error.message);
    }
    
    console.log(`[AudioSession] ✅ Event listeners attached for guild ${guildId}`);
    } else {
        console.log(`[AudioSession] Event listeners already attached for guild ${guildId} - reusing session`);
    }

    connection.subscribe(player);
    guildAudioSessions.set(guildId, session);
    
    console.log(`[AudioSession] Created new session for guild ${guildId}`);
    return session;
}

// REMOVED: playNextSongFromQueue function - replaced with optimized playNextInQueue
// All queue processing now uses the unified audio processing pipeline with proper volume control

// Simple session retrieval and update
export async function getOrUpdateSession(djsClient, guildId, connection, channelId, playNextInQueue) {
    return await getOrCreateAudioSession(guildId, connection, channelId, djsClient, playNextInQueue);
}

// Simple play state checking
export function canPlayImmediately(session) {
    if (!session || !session.player) return false;
    
    // Use state manager for consistent state checking
    return playerStateManager.canPlayImmediately(session.guildId, session);
}

/**
 * Comprehensive cleanup when player is stopped (used by stop command, voice timeout, etc.)
 * This mirrors the cleanup done in AudioPlayerStatus.Idle but can be called explicitly
 */
export async function performComprehensiveStopCleanup(guildId, session, reason = 'manual stop') {
    console.log(`[StopCleanup] 🧹 COMPREHENSIVE STOP CLEANUP: Starting complete cleanup for guild ${guildId} (${reason})`);
    
    try {
        // STEP 1: COMPREHENSIVE CLEANUP - Use centralized cleanup service
        try {
            const { cleanupService } = await import('../../utils/services/cleanup-service.js');
            await cleanupService.cleanupGuildResources(guildId, session);
            console.log(`[StopCleanup] ✅ Comprehensive cleanup completed for guild ${guildId}`);
        } catch (cleanupError) {
            console.error(`[StopCleanup] Error during comprehensive cleanup:`, cleanupError);
        }
        
        // STEP 3: SKIP QUEUE CLEANUP - Don't clean up songs that are still needed
        // Queue songs should only be cleaned up when they're actually removed/played
        if (session?.queue && session.queue.length > 0) {
            console.log(`[StopCleanup] Preserving ${session.queue.length} songs in queue - they're still needed`);
        }
        
        // STEP 4: COMPREHENSIVE MAP CLEANUP
        try {
        // Use centralized cleanup service
        const { cleanupService } = await import('../../utils/services/cleanup-service.js');
        await cleanupService.cleanupSongFinishMaps(guildId);
            console.log(`[StopCleanup] Map cleanup completed for guild ${guildId}`);
        } catch (error) {
            console.error(`[StopCleanup] Error cleaning up Maps:`, error);
        }
        
        // STEP 5: AGGRESSIVE YTDLP CLEANUP
        try {
            const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
            unifiedYtdlpService.aggressiveSongCleanup();
        } catch (aggressiveCleanupError) {
            console.warn(`[StopCleanup] Error during aggressive ytdlp cleanup:`, aggressiveCleanupError.message);
        }
        
        // STEP 6: SINGLE GARBAGE COLLECTION (streamlined)
        if (global.gc) {
            console.log(`[StopCleanup] 🗑️ Running garbage collection`);
            global.gc();
        }
        
        // STEP 7: CLEAR DATABASE QUEUE
        try {
            const { saveGuildQueue } = await import('../../utils/database/guildQueues.js');
            await saveGuildQueue(guildId, { 
                nowPlaying: null, 
                queue: [], 
                history: session?.history || [], 
                lazyLoadInfo: null 
            });
            console.log(`[StopCleanup] ✅ Cleared database queue for guild ${guildId}`);
        } catch (dbError) {
            console.log(`[StopCleanup] Database cleanup error:`, dbError.message);
        }
        
        // STEP 8: RESET SESSION STATE
        if (session) {
            playerStateManager.clearNowPlaying(guildId);
            playerStateManager.setLoading(guildId, false);
            
            // CRITICAL: Properly destroy audio resource before nulling
            if (session.audioResource) {
                try {
                    if (session.audioResource.destroy) {
                        session.audioResource.destroy();
                    }
                    session.audioResource = null;
                } catch (resourceError) {
                    console.warn(`[StopCleanup] Error destroying audio resource:`, resourceError.message);
                }
            }
        }
        
        // STEP 8: LOG MEMORY MAP AFTER CLEANUP
        try {
            const { processManager } = await import('../../utils/services/process-manager.js');
            console.log(`[StopCleanup] 📊 MEMORY MAP AFTER STOP CLEANUP:`);
            processManager.logDetailedMemoryMap();
        } catch (error) {
            console.log(`[StopCleanup] Error logging memory map:`, error.message);
        }
        
        console.log(`[StopCleanup] ✅ COMPREHENSIVE STOP CLEANUP COMPLETE for guild ${guildId} (${reason})`);
        
    } catch (error) {
        console.error(`[StopCleanup] Error during comprehensive stop cleanup:`, error);
    }
}

// Simple volume control
export async function applyVolumeToSession(guildId, newVolume, isMuted = false, djsClient = null) {
    const session = getExistingSession(guildId);
    if (!session) {
        console.log(`[Volume] No session found for guild ${guildId}`);
        return false;
    }

    try {
        const oldVolume = session.volume || 100;
        session.volume = Math.max(0, Math.min(100, newVolume));
        session.isMuted = isMuted;
        
        console.log(`[Volume] Updated volume for guild ${guildId}: ${oldVolume}% → ${session.volume}% (muted: ${isMuted})`);
        
        // CRITICAL: Re-process preloaded songs with new volume
        if (session.queue && session.queue.length > 0) {
            console.log(`[Volume] 🔄 Re-processing ${session.queue.length} preloaded songs with new volume ${session.volume}%`);
            
            for (let i = 0; i < session.queue.length; i++) {
                const song = session.queue[i];
                
                // Re-process preloaded songs with new volume
                if (song.preloadCompleted && song.processedTempFile) {
                    console.log(`[Volume] 📝 Re-processing song "${song.title}" with new volume ${session.volume}%`);
                    
                    try {
                        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
                        const streamData = await unifiedYtdlpService.getAudioStreamFromTempFile(
                            song.preloadedTempFile, // Use original temp file for re-processing
                            guildId, 
                            session.volume, 
                            song.preloadedMetadata
                        );
                        
                        // Update with new processed file
                        song.processedTempFile = streamData.processedTempFile; // Use the actual processed file path
                        song.processedAudioResource = streamData.audioResource;
                        song.processedVolume = session.volume; // Store the new volume used
                        
                        console.log(`[Volume] ✅ Re-processed "${song.title}" with volume ${session.volume}%: ${song.processedTempFile}`);
                    } catch (processError) {
                        console.error(`[Volume] ❌ Failed to re-process "${song.title}":`, processError.message);
                        
                        // Fallback: Clear processed files so they get recreated at playback
                        song.processedTempFile = null;
                        song.processedAudioResource = null;
                        console.log(`[Volume] 🧹 Cleared processed file for "${song.title}" - will be recreated at playback`);
                    }
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error(`[Volume] Error applying volume:`, error);
        return false;
    }
}

// Simple cleanup for when session is no longer needed - now uses centralized cleanup service
export async function cleanupAudioSession(guildId) {
    const { cleanupService } = await import('../../utils/services/cleanup-service.js');
    return await cleanupService.cleanupAudioSession(guildId);
}

// --- REMOVED: All other cleanup functions moved to utils/cleanup-service.js ---

/**
 * Clean up Maps after each song finishes (lighter cleanup)
 */
export async function cleanupSongFinishMaps(guildId) {
    const startTime = Date.now();
    const memBefore = process.memoryUsage();
    
    console.log(`[Cleanup] 🧹 SONG FINISH CLEANUP: Cleaning Maps after song finished for guild ${guildId}`);
    console.log(`[Cleanup] Memory before cleanup: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB`);
    
    try {
        // Clean up process manager - remove old process data
        const { processManager } = await import('../../utils/services/process-manager.js');
        processManager.cleanupOldProcessData();
        
        // Clean up unified ytdlp service - remove old queries
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        unifiedYtdlpService.cleanupStaleQueries();
        
        // Force cleanup of recently completed queries
        const now = Date.now();
        for (const [query, timestamp] of unifiedYtdlpService.recentlyCompletedQueries) {
            if (now - timestamp > 5000) { // 5 seconds - more aggressive cleanup
                unifiedYtdlpService.recentlyCompletedQueries.delete(query);
            }
        }
        
        // STREAMLINED CLEANUP: Only essential cleanup functions
        // Removed redundant cleanup calls - they're handled by the streamlined system
        
        // STREAMLINED GARBAGE COLLECTION: Single efficient GC call
        if (global.gc) {
            console.log(`[StreamlinedCleanup] 🗑️ Running garbage collection`);
            global.gc();
        } else {
            console.log(`[StreamlinedCleanup] ⚠️ Garbage collection not available - run with --expose-gc`);
        }
        
        const memAfter = process.memoryUsage();
        const memFreed = memBefore.heapUsed - memAfter.heapUsed;
        const cleanupTime = Date.now() - startTime;
        
        console.log(`[Cleanup] ✅ SONG FINISH CLEANUP COMPLETE for guild ${guildId}`);
        console.log(`[Cleanup] Heap before: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(memBefore.rss / 1024 / 1024)}MB`);
        console.log(`[Cleanup] Heap after: ${Math.round(memAfter.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(memAfter.rss / 1024 / 1024)}MB`);
        console.log(`[Cleanup] Heap freed: ${Math.round(memFreed / 1024 / 1024)}MB, RSS change: ${Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024)}MB (${cleanupTime}ms)`);
        
        // Check memory usage after cleanup (event-driven)
        checkMemoryUsage();
        
        // Check if memory was actually freed and trigger emergency cleanup if needed
        const memAfterMB = Math.round(memAfter.heapUsed / 1024 / 1024);
        const memRSSAfterMB = Math.round(memAfter.rss / 1024 / 1024);
        const memExternalAfterMB = Math.round(memAfter.external / 1024 / 1024);
        
        if (memFreed > 0) {
            console.log(`[Cleanup] ✅ Memory successfully freed: ${Math.round(memFreed / 1024 / 1024)}MB`);
        } else {
            console.log(`[Cleanup] ⚠️ No heap memory freed - heap may be stable, but checking RSS/external memory`);
        }
        
        // Log detailed memory breakdown
        console.log(`[Cleanup] 📊 Memory breakdown - Heap: ${memAfterMB}MB, RSS: ${memRSSAfterMB}MB, External: ${memExternalAfterMB}MB`);
        
        // STREAMLINED CLEANUP: No emergency cleanup needed - streamlined system handles memory efficiently
        
    } catch (error) {
        console.error(`[Cleanup] Error during song finish cleanup:`, error);
    }
}

/**
 * Comprehensive cleanup for all Maps when a guild disconnects
 */
export async function cleanupAllGuildMaps(guildId) {
    console.log(`[Cleanup] 🧹 COMPREHENSIVE MAP CLEANUP: Cleaning all Maps for guild ${guildId}`);
    
    try {
        // Clean up process manager
        const { processManager } = await import('../../utils/services/process-manager.js');
        processManager.cleanupGuildData(guildId);
        
        // Clean up unified ytdlp service
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        unifiedYtdlpService.cleanupGuildData(guildId);
        
        // Clean up menu component handlers
        const { cleanupGuildMaps } = await import('../menu-component-handlers.js');
        cleanupGuildMaps(guildId);
        
        // Clean up message manager
        const { cleanupGuildMessageLocks } = await import('../../utils/services/helpers/message-helpers.js');
        cleanupGuildMessageLocks(guildId);
        
        // Clean up rate limiting
        const { cleanupGuildRateLimit } = await import('../../utils/services/rateLimiting.js');
        cleanupGuildRateLimit(guildId);
        
        // Clean up queue saver
        const { queueSaver } = await import('../../utils/services/queue-saver.js');
        queueSaver.cleanupGuildData(guildId);
        
        // Clean up pending queue
        const { cleanupGuildPendingQueue } = await import('../../utils/services/pending-queue.js');
        cleanupGuildPendingQueue(guildId);
        
        // Clean up commands
        const { cleanupService } = await import('../../utils/services/cleanup-service.js');
        cleanupService.cleanupGuildCommandData(guildId);
        
        // Clean up loading states
        const { unifiedLoadingService } = await import('../../utils/services/unified-loading-service.js');
        unifiedLoadingService.cleanupGuildLoadingState(guildId);
        
        // Clean up missing Maps
        songMemoryTracker.delete(guildId);
        rssTrendTracker.delete(guildId);
        
        // Clean up player Maps
        const { Player } = await import('../core/player.js');
        const player = new Player();
        player.playingSongs.delete(guildId);
        
        // Clean up message references
        const { messageReferences } = await import('../message/reference-managers.js');
        const guildRefs = messageReferences.get(guildId);
        if (guildRefs) {
            guildRefs.clear();
            messageReferences.delete(guildId);
        }
        
        // Clean up auto-advance service
        const { autoAdvanceService } = await import('../../utils/services/auto-advance-service.js');
        autoAdvanceService.advanceInProgress.delete(guildId);
        
        console.log(`[Cleanup] ✅ COMPREHENSIVE MAP CLEANUP COMPLETE for guild ${guildId}`);
    } catch (error) {
        console.error(`[Cleanup] Error during comprehensive map cleanup:`, error);
    }
}

/**
 * Inspect all Maps to see what's consuming memory
 */
export async function inspectAllMaps() {
    console.log(`[MapInspector] 🔍 INSPECTING ALL MAPS:`);
    
    try {
        // Process Manager Maps
        const { processManager } = await import('../../utils/services/process-manager.js');
        console.log(`[MapInspector] Process Manager:`);
        console.log(`  - guildProcesses: ${processManager.guildProcesses?.size || 0} entries`);
        console.log(`  - processTypes: ${processManager.processTypes?.size || 0} entries`);
        console.log(`  - processMemory: ${processManager.processMemory?.size || 0} entries`);
        
        // Unified Ytdlp Service Maps
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        console.log(`[MapInspector] Unified Ytdlp Service:`);
        console.log(`  - activeQueries: ${unifiedYtdlpService.activeQueries?.size || 0} entries`);
        console.log(`  - recentlyCompletedQueries: ${unifiedYtdlpService.recentlyCompletedQueries?.size || 0} entries`);
        
        // Menu Component Handlers Maps
        const { cleanupGuildMaps } = await import('../menu-component-handlers.js');
        console.log(`[MapInspector] Menu Component Handlers:`);
        console.log(`  - Menu component Maps loaded via import`);
        
        // Message Manager Maps
        const { cleanupGuildMessageLocks } = await import('../../utils/helpers/message-helpers.js');
        console.log(`[MapInspector] Message Manager:`);
        console.log(`  - Message manager Maps loaded via import`);
        
        // Rate Limiting Maps
        const { cleanupGuildRateLimit } = await import('../../middleware/rate-limiting-middleware.js');
        console.log(`[MapInspector] Rate Limiting:`);
        console.log(`  - Rate limiting Maps loaded via import`);
        
        // Queue Saver Maps
        const { queueSaver } = await import('../../utils/queue-saver.js');
        console.log(`[MapInspector] Queue Saver:`);
        console.log(`  - savedPlaylists: ${queueSaver.savedPlaylists?.size || 0} entries`);
        console.log(`  - autoSaveEnabled: ${queueSaver.autoSaveEnabled?.size || 0} entries`);
        
        // Pending Queue Maps
        const { cleanupGuildPendingQueue } = await import('../../utils/core/pending-queue.js');
        console.log(`[MapInspector] Pending Queue:`);
        console.log(`  - Pending queue Maps loaded via import`);
        
        // Commands Maps
        const { cleanupGuildCommandData } = await import('../../commands/play.js');
        console.log(`[MapInspector] Commands:`);
        console.log(`  - Commands Maps loaded via import`);
        
        // Audio Session Maps
        console.log(`[MapInspector] Audio Session:`);
        console.log(`  - guildAudioSessions: ${guildAudioSessions?.size || 0} entries`);
        console.log(`  - songMemoryTracker: ${songMemoryTracker?.size || 0} entries`);
        console.log(`  - rssTrendTracker: ${rssTrendTracker?.size || 0} entries`);
        
        // Player Maps
        const { Player } = await import('../core/player.js');
        const player = new Player();
        console.log(`[MapInspector] Player:`);
        console.log(`  - playingSongs: ${player.playingSongs?.size || 0} entries`);
        
        // Media Handler Maps
        const { UnifiedMediaHandler } = await import('../core/unified-media-handler.js');
        const mediaHandler = new UnifiedMediaHandler();
        console.log(`[MapInspector] Media Handler:`);
        console.log(`  - mediaProcessors: ${mediaHandler.mediaProcessors?.size || 0} entries`);
        
        // Message Reference Maps
        const { messageReferences } = await import('../message/reference-managers.js');
        console.log(`[MapInspector] Message References:`);
        console.log(`  - messageReferences: ${messageReferences?.size || 0} entries`);
        
        // Loading Service Maps
        const { unifiedLoadingService } = await import('../../utils/services/unified-loading-service.js');
        console.log(`[MapInspector] Loading Service:`);
        console.log(`  - activeLoadings: ${unifiedLoadingService.activeLoadings?.size || 0} entries`);
        
        // Auto-Advance Service Maps
        const { autoAdvanceService } = await import('../../utils/services/auto-advance-service.js');
        console.log(`[MapInspector] Auto-Advance Service:`);
        console.log(`  - advanceInProgress: ${autoAdvanceService.advanceInProgress?.size || 0} entries`);
        
        // Show detailed content for the largest Maps
        console.log(`[MapInspector] 🔍 DETAILED INSPECTION:`);
        
        // Show active queries details
        if (unifiedYtdlpService.activeQueries?.size > 0) {
            console.log(`[MapInspector] Active Queries Details:`);
            for (const [query, data] of unifiedYtdlpService.activeQueries) {
                console.log(`  - "${query}": guildId=${data.guildId}, timestamp=${new Date(data.timestamp).toISOString()}`);
            }
        }
        
        // Show process details with enhanced information
        if (processManager.processTypes?.size > 0) {
            console.log(`[MapInspector] Process Details:`);
            for (const [process, data] of processManager.processTypes) {
                const age = Math.round((Date.now() - data.startTime) / 1000);
                const memoryInfo = processManager.processMemory.get(process);
                const memoryMB = memoryInfo ? Math.round(memoryInfo.rss / 1024 / 1024) : 0;
                const isKilled = process.killed;
                const isFinished = process._finished;
                
                console.log(`  - PID ${process.pid}: type=${data.type}, guildId=${data.guildId}`);
                console.log(`    startTime=${new Date(data.startTime).toISOString()}, age=${age}s`);
                console.log(`    memory=${memoryMB}MB, killed=${isKilled}, finished=${isFinished}`);
                
                // Show if this is a stuck process
                if (age > 60 && !isKilled && !isFinished) {
                    console.log(`    ⚠️  STUCK PROCESS: Running for ${age}s without finishing!`);
                }
            }
        }
        
        // REMOVED: searchCache - functionality moved to unified ytdlp service
        
        // Show largest Maps by size
        console.log(`[MapInspector] 📊 LARGEST MAPS BY SIZE:`);
        const mapSizes = [
            { name: 'guildAudioSessions', size: guildAudioSessions?.size || 0 },
            { name: 'activeQueries', size: unifiedYtdlpService.activeQueries?.size || 0 },
            { name: 'processTypes', size: processManager.processTypes?.size || 0 },
            { name: 'recentlyCompletedQueries', size: unifiedYtdlpService.recentlyCompletedQueries?.size || 0 },
            { name: 'guildProcesses', size: processManager.guildProcesses?.size || 0 },
            { name: 'processMemory', size: processManager.processMemory?.size || 0 },
            { name: 'savedPlaylists', size: queueSaver.savedPlaylists?.size || 0 },
            { name: 'autoSaveEnabled', size: queueSaver.autoSaveEnabled?.size || 0 },
            { name: 'songMemoryTracker', size: songMemoryTracker?.size || 0 },
            { name: 'rssTrendTracker', size: rssTrendTracker?.size || 0 },
            { name: 'playingSongs', size: player.playingSongs?.size || 0 },
            { name: 'mediaProcessors', size: mediaHandler.mediaProcessors?.size || 0 },
            { name: 'messageReferences', size: messageReferences?.size || 0 },
            { name: 'activeLoadings', size: unifiedLoadingService.activeLoadings?.size || 0 },
            { name: 'advanceInProgress', size: autoAdvanceService.advanceInProgress?.size || 0 },
            { name: 'preloadInProgress', size: preloader.preloadInProgress?.size || 0 },
            { name: 'preloadPromises', size: preloader.preloadPromises?.size || 0 },
            { name: 'guildPreloadedData', size: preloader.guildPreloadedData?.size || 0 }
        ];
        
        mapSizes.sort((a, b) => b.size - a.size);
        mapSizes.forEach((map, index) => {
            if (map.size > 0) {
                console.log(`  ${index + 1}. ${map.name}: ${map.size} entries`);
            }
        });
        
        console.log(`[MapInspector] ✅ Inspection complete`);
        
    } catch (error) {
        console.error(`[MapInspector] Error during inspection:`, error);
    }
}

/**
 * Inspect stuck processes in detail
 */
export async function inspectStuckProcesses() {
    console.log(`[StuckProcessInspector] 🔍 INSPECTING STUCK PROCESSES:`);
    
    try {
        const { processManager } = await import('../../utils/services/process-manager.js');
        const now = Date.now();
        let stuckCount = 0;
        
        console.log(`[StuckProcessInspector] Checking ${processManager.processTypes?.size || 0} tracked processes...`);
        
        for (const [process, data] of processManager.processTypes) {
            const age = Math.round((now - data.startTime) / 1000);
            const memoryInfo = processManager.processMemory.get(process);
            const memoryMB = memoryInfo ? Math.round(memoryInfo.rss / 1024 / 1024) : 0;
            const isKilled = process.killed;
            const isFinished = process._finished;
            
            // Check if process is stuck (running for more than 30 seconds without finishing)
            if (age > 30 && !isKilled && !isFinished) {
                stuckCount++;
                console.log(`[StuckProcessInspector] 🚨 STUCK PROCESS FOUND:`);
                console.log(`  - PID: ${process.pid}`);
                console.log(`  - Type: ${data.type}`);
                console.log(`  - Guild: ${data.guildId}`);
                console.log(`  - Age: ${age} seconds (${Math.round(age / 60)} minutes)`);
                console.log(`  - Memory: ${memoryMB}MB`);
                console.log(`  - Killed: ${isKilled}`);
                console.log(`  - Finished: ${isFinished}`);
                console.log(`  - Start Time: ${new Date(data.startTime).toISOString()}`);
                
                // Show process command if available
                if (process.spawnargs) {
                    console.log(`  - Command: ${process.spawnfile} ${process.spawnargs.join(' ')}`);
                }
                
                // Show if it's ytdlp or ffmpeg specifically
                if (data.type === 'ffmpeg') {
                    console.log(`  - ⚠️  This is a STUCK FFMPEG process consuming ~${memoryMB}MB`);
                } else if (data.type === 'ytdlp') {
                    console.log(`  - ⚠️  This is a STUCK YTDLP process consuming ~${memoryMB}MB`);
                }
                
                console.log(`  - Recommendation: Kill this process to free memory`);
                console.log(`  - Command to kill: kill -9 ${process.pid}`);
                console.log(`  - Or use: processManager.killProcess(process, '${data.guildId}')`);
                console.log(`  ---`);
            }
        }
        
        if (stuckCount === 0) {
            console.log(`[StuckProcessInspector] ✅ No stuck processes found`);
        } else {
            console.log(`[StuckProcessInspector] 🚨 Found ${stuckCount} stuck processes consuming memory`);
        }
        
        // Show total memory usage
        const memUsage = process.memoryUsage();
        console.log(`[StuckProcessInspector] Current memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        
    } catch (error) {
        console.error(`[StuckProcessInspector] Error during inspection:`, error);
    }
}

/**
 * Force kill all stuck processes
 */
export async function forceKillStuckProcesses() {
    console.log(`[ForceKill] 🔪 FORCE KILLING STUCK PROCESSES:`);
    
    try {
        const { processManager } = await import('../../utils/services/process-manager.js');
        const now = Date.now();
        let killedCount = 0;
        
        for (const [process, data] of processManager.processTypes) {
            const age = Math.round((now - data.startTime) / 1000);
            const isKilled = process.killed;
            const isFinished = process._finished;
            
            // Kill processes that are stuck (running for more than 30 seconds without finishing)
            if (age > 30 && !isKilled && !isFinished) {
                console.log(`[ForceKill] Killing stuck ${data.type} process PID ${process.pid} (age: ${age}s)`);
                
                try {
                    await processManager.killProcess(process, data.guildId);
                    killedCount++;
                    console.log(`[ForceKill] ✅ Successfully killed PID ${process.pid}`);
                } catch (error) {
                    console.error(`[ForceKill] ❌ Failed to kill PID ${process.pid}:`, error.message);
                }
            }
        }
        
        if (killedCount === 0) {
            console.log(`[ForceKill] ✅ No stuck processes found to kill`);
        } else {
            console.log(`[ForceKill] ✅ Killed ${killedCount} stuck processes`);
        }
        
        // Show memory after cleanup
        const memUsage = process.memoryUsage();
        console.log(`[ForceKill] Memory after cleanup: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        
    } catch (error) {
        console.error(`[ForceKill] Error during force kill:`, error);
    }
}

/**
 * Check memory usage and trigger cleanup if needed
 */
export function checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    // Trigger emergency cleanup if memory usage is high
    if (heapMB > 100) {
        console.log(`[MemoryMonitor] 🚨 HIGH MEMORY USAGE: ${heapMB}MB - triggering emergency cleanup`);
        emergencyMemoryCleanup();
    } else if (heapMB > 80) {
        console.log(`[MemoryMonitor] ⚠️ MODERATE MEMORY USAGE: ${heapMB}MB - triggering aggressive cleanup`);
        aggressiveMemoryCleanup();
    }
}

/**
 * Aggressive memory cleanup for moderate memory usage
 */
export async function aggressiveMemoryCleanup() {
    const memUsage = process.memoryUsage();
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    console.log(`[Aggressive] ⚠️ AGGRESSIVE MEMORY CLEANUP: ${heapMB}MB used`);
    
    try {
        // Clean up Maps aggressively
        const { processManager } = await import('../../utils/services/process-manager.js');
        processManager.cleanupOldProcessData();
        
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        unifiedYtdlpService.cleanupStaleQueries();
        
        const { preloader } = await import('../../utils/services/preloader.js');
        preloader.cleanupOldPreloadedData();
        
        // Force garbage collection
        if (global.gc) {
            global.gc();
        }
        
        const memAfter = process.memoryUsage();
        const memFreed = memUsage.heapUsed - memAfter.heapUsed;
        
        console.log(`[Aggressive] ✅ Aggressive cleanup complete: ${Math.round(memFreed / 1024 / 1024)}MB freed`);
        
    } catch (error) {
        console.error(`[Aggressive] Error during aggressive cleanup:`, error);
    }
}

/**
 * Emergency memory cleanup - call when memory gets too high
 */
export async function emergencyMemoryCleanup() {
    const memUsage = process.memoryUsage();
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    console.log(`[Emergency] 🚨 EMERGENCY MEMORY CLEANUP: ${heapMB}MB used`);
    
    try {
        // Clean up all Maps aggressively
        const { processManager } = await import('../../utils/services/process-manager.js');
        processManager.cleanupOldProcessData();
        
        const { unifiedYtdlpService } = await import('../../utils/processors/unified-ytdlp-service.js');
        unifiedYtdlpService.cleanupAllData();
        
        const { cleanupOldMapData } = await import('../menu-component-handlers.js');
        cleanupOldMapData();
        
        const { cleanupOldMessageLocks } = await import('../../utils/services/helpers/message-helpers.js');
        cleanupOldMessageLocks();
        
        const { cleanupOldRateLimitData } = await import('../../utils/services/rateLimiting.js');
        cleanupOldRateLimitData();
        
        const { queueSaver } = await import('../../utils/services/queue-saver.js');
        queueSaver.cleanupOldData();
        
        const { cleanupOldPendingQueues } = await import('../../utils/services/pending-queue.js');
        cleanupOldPendingQueues();
        
        const { cleanupService } = await import('../../utils/services/cleanup-service.js');
        cleanupService.cleanupOldCommandData();
        
        // Clean up missing Maps aggressively
        songMemoryTracker.clear();
        rssTrendTracker.clear();
        
        // Clean up player Maps
        const { Player } = await import('../core/player.js');
        const player = new Player();
        player.playingSongs.clear();
        
        // Clean up message references
        const { messageReferences } = await import('../message/reference-managers.js');
        messageReferences.clear();
        
        // Clean up auto-advance service
        const { autoAdvanceService } = await import('../../utils/services/auto-advance-service.js');
        autoAdvanceService.advanceInProgress.clear();
        
        // SINGLE GARBAGE COLLECTION (streamlined)
        if (global.gc) {
            console.log(`[Emergency] 🗑️ Running emergency garbage collection`);
            global.gc();
        }
        
        const memAfter = process.memoryUsage();
        const memFreed = memUsage.heapUsed - memAfter.heapUsed;
        
        console.log(`[Emergency] ✅ Emergency cleanup complete: ${Math.round(memFreed / 1024 / 1024)}MB freed`);
        
    } catch (error) {
        console.error(`[Emergency] Error during emergency cleanup:`, error);
    }
}

// REMOVED: Redundant cleanup helper functions - functionality consolidated into streamlined cleanup

// Stub functions for compatibility (remove these once other files are updated)
export function startMemoryCleanup() { /* Removed - use proper architecture instead */ }
export function stopMemoryCleanup() { /* Removed - use proper architecture instead */ }
export async function monitorCppAddons() { /* Removed - use proper architecture instead */ }
export async function analyzeMemoryLeaks() { /* Removed - use proper architecture instead */ }
export async function showMemorySnapshot() { /* Removed - use proper architecture instead */ }
export async function generateHeapProfile() { /* Removed - use proper architecture instead */ }
export async function getHeapStatistics() { /* Removed - use proper architecture instead */ }
export async function forceDockerMemoryCleanup() { /* Removed - use proper architecture instead */ }
export function acquireProcessingLock(guildId, songTitle) { return true; /* Simplified */ }
export function releaseProcessingLock(guildId, songTitle) { /* Simplified */ }
export function isSongBeingProcessed(guildId, songTitle) { return false; /* Simplified */ }
export async function updateUIForQueueChange(guildId, djsClient, session, displayPref) { /* Simplified */ }

// REMOVED: loadNextBatchFromDatabase function - lazy loading now handled by centralized queue manager

