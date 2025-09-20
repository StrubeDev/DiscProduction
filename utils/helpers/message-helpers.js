// Example: messageManager.js
import { getVoiceConnection } from '@discordjs/voice';
import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
// Ensure this path is correct for your project structure
import { guildQueueDisplayPreference } from '../queue/display-preferences.js';

const _MAX_HISTORY_LENGTH = 10; // Max songs in history
const MAX_QUEUE_DISPLAY = 10;  // Max songs to show in queue embed

const queueMessageLocks = new Map(); // guildId -> Promise

/**
 * Clean up message locks for a specific guild
 */
export function cleanupGuildMessageLocks(guildId) {
    if (queueMessageLocks.has(guildId)) {
        queueMessageLocks.delete(guildId);
        console.log(`[MessageManager] 🧹 Cleaned up message locks for guild ${guildId}`);
    }
}

/**
 * Clean up old message locks to prevent memory leaks
 */
export function cleanupOldMessageLocks() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    let cleanedCount = 0;
    
    for (const [guildId, promise] of queueMessageLocks) {
        // Check if promise is resolved/rejected (old)
        if (promise && typeof promise.then === 'function') {
            promise.then(() => {
                // Promise resolved, clean it up
                queueMessageLocks.delete(guildId);
                cleanedCount++;
            }).catch(() => {
                // Promise rejected, clean it up
                queueMessageLocks.delete(guildId);
                cleanedCount++;
            });
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[MessageManager] 🧹 Cleaned up ${cleanedCount} old message locks`);
    }
}

export async function formatQueueMessagePayload(sessionData, isStopped = false, guildId = null) {
    console.log(`[QueueMsg] formatQueueMessagePayload called with:`, {
        hasSessionData: !!sessionData,
        isStopped,
        hasNowPlaying: !!sessionData?.nowPlaying,
        queueLength: sessionData?.queue?.length || 0,
        historyLength: sessionData?.history?.length || 0
    });
    
    // ADDED: Debug logging for queue content
    if (sessionData && sessionData.queue) {
        console.log(`[QueueMsg] Queue content:`, sessionData.queue.map((song, index) => `${index + 1}. ${song.title}`));
    }
    
    // If the bot is stopped, return null to indicate no message should be shown
    if (isStopped) {
        console.log(`[QueueMsg] Bot is stopped, returning null payload`);
        return null;
    }

    const embed = {
        color: 0x506098,
        title: 'Queue & Playback Status'
    };
    
    console.log(`[QueueMsg] Created embed with title: "${embed.title}"`);

    // ADDED: Show playlist information if available
    if (sessionData && sessionData.currentPlaylist) {
        // REMOVED: Playlist description that shows "🎵 YouTube Playlist - 3 tracks"
        // Only show playlist info if there's a description, not just the basic title/track count
        let playlistDescription = '';
        
        // REMOVED: Playlist owner display that shows "🎵 ☯️ • by ☯︎"
        
        // ADDED: Show playlist description if available (truncated to fit)
        if (sessionData.currentPlaylist.description) {
            const maxDescLength = 100; // Limit description length
            const truncatedDesc = sessionData.currentPlaylist.description.length > maxDescLength 
                ? sessionData.currentPlaylist.description.substring(0, maxDescLength) + '...'
                : sessionData.currentPlaylist.description;
            playlistDescription += `💬 ${truncatedDesc}`;
        }
        
        // Only add description if we have meaningful content
        if (playlistDescription) {
            embed.description = playlistDescription;
            console.log(`[QueueMsg] Added playlist description: "${embed.description}"`);
        }
    }

    if (sessionData && sessionData.nowPlaying) {
        if (!embed.fields) embed.fields = [];
        
        // Show clean title-artist format without quotes
        const artist = sessionData.nowPlaying.uploader || sessionData.nowPlaying.artist || 'Unknown Artist';
        embed.fields.push({ name: '▶ Now Playing', value: `${sessionData.nowPlaying.title} - ${artist}` });
        console.log(`[QueueMsg] Added now playing field: "${sessionData.nowPlaying.title} - ${artist}"`);
        
        // DEBUG: Log what thumbnail properties are available
        console.log(`[QueueMsg] DEBUG - Song object properties:`, Object.keys(sessionData.nowPlaying));
        console.log(`[QueueMsg] DEBUG - thumbnailUrl:`, sessionData.nowPlaying.thumbnailUrl);
        console.log(`[QueueMsg] DEBUG - thumbnail:`, sessionData.nowPlaying.thumbnail);
        
        // Add thumbnail if available (prioritize album art for better 4:3 ratio, then artist images, then YouTube thumbnails)
        if (sessionData.nowPlaying.thumbnailUrl) {
            // Use general thumbnail URL (could be album art or YouTube thumbnail)
            embed.thumbnail = { url: sessionData.nowPlaying.thumbnailUrl };
            console.log(`[QueueMsg] Added thumbnail for now playing: ${sessionData.nowPlaying.thumbnailUrl}`);
        } else if (sessionData.nowPlaying.spotifyData?.artistImageUrl) {
            // Use Spotify artist image as fallback
            embed.thumbnail = { url: sessionData.nowPlaying.spotifyData.artistImageUrl };
            console.log(`[QueueMsg] Added Spotify artist image thumbnail: ${sessionData.nowPlaying.spotifyData.artistImageUrl}`);
        } else if (sessionData.nowPlaying.thumbnail) {
            // Try alternative thumbnail property
            embed.thumbnail = { url: sessionData.nowPlaying.thumbnail };
            console.log(`[QueueMsg] Added thumbnail for now playing: ${sessionData.nowPlaying.thumbnail}`);
        } else {
            console.log(`[QueueMsg] No thumbnail found for song: ${sessionData.nowPlaying.title}`);
        }
    } else {
        // CRITICAL FIX: Clear thumbnail when no song is playing
        // This ensures the old song's thumbnail doesn't persist
        if (embed.thumbnail) {
            console.log(`[QueueMsg] Clearing thumbnail - no song currently playing`);
            delete embed.thumbnail;
        }
    }

    if (sessionData && sessionData.queue && sessionData.queue.length > 0) {
        if (!embed.fields) embed.fields = [];
        
        // FIXED: Use total queue count including database songs
        const totalQueueCount = sessionData.lazyLoadInfo?.totalCount || sessionData.queue.length;
        
        // ADDED: Enhanced queue display with thumbnails and playlist info
        const queueDisplay = sessionData.queue
            .slice(0, MAX_QUEUE_DISPLAY)
            .map((song, index) => {
                let displayText = `${index + 1}. ${song.title}`;
                

                
                return displayText;
            })
            .join('\n');
            
        embed.fields.push({ name: '⬆ Up Next', value: queueDisplay.substring(0, 1020) || 'Queue is empty.' }); // Max field value length is 1024
        console.log(`[QueueMsg] Added queue field with ${sessionData.queue.length} songs (total: ${totalQueueCount})`);
        
        if (totalQueueCount > MAX_QUEUE_DISPLAY) {
            embed.footer = { text: `...and ${totalQueueCount - MAX_QUEUE_DISPLAY} more.` };
            console.log(`[QueueMsg] Added footer: "${embed.footer.text}"`);
        }
    } else if (sessionData && sessionData.nowPlaying) {
        // Only show "queue is empty" field if there's something currently playing AND the queue is actually empty
        if (!embed.fields) embed.fields = [];
        embed.fields.push({ name: '⬆ Up Next', value: 'The queue is empty.' });
        console.log(`[QueueMsg] Added empty queue field`);
    } else if (sessionData && (!sessionData.nowPlaying && (!sessionData.queue || sessionData.queue.length === 0))) {
        // If no nowPlaying and no queue, show the empty queue message
        embed.description = 'The queue is empty! Use `/play` to add a song.';
        console.log(`[QueueMsg] Added description: "${embed.description}"`);
    }

    // HISTORY: Fetch from database instead of memory
    if (sessionData && sessionData.guildId) {
        try {
            const { getGuildQueue } = await import('../database/guildQueues.js');
            const savedData = await getGuildQueue(sessionData.guildId);
            if (savedData && savedData.history && savedData.history.length > 0) {
                if (!embed.fields) embed.fields = [];
                const historyString = savedData.history
                    .map((song, index) => `${index + 1}. ${song.title}`) // History is added to the top, so index 0 is newest
                    .join('\n');
                embed.fields.push({ name: '✅ Recently Played', value: historyString.substring(0, 1020) || 'No songs in history.' });
                console.log(`[QueueMsg] Added history field with ${savedData.history.length} songs from database`);
            }
        } catch (error) {
            console.error(`[QueueMsg] Error fetching history from database:`, error.message);
        }
    }

    // Add playback controls
    const components = [];
    


    const finalPayload = { embeds: [embed], components: components, content: '' };
    console.log(`[QueueMsg] Final payload created with ${embed.fields?.length || 0} fields`);
    
    return finalPayload;
}

// FIXED: Better queue message management to prevent duplicates
export async function updatePersistentQueueMessage(guildId, djsClient, session, forceNew = false) {
    // Check preference
    const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
    console.log(`[QueueMsg] updatePersistentQueueMessage called for guild ${guildId}, displayPref: ${displayPref}, forceNew: ${forceNew}`);
    
    // ADDED: Debug logging for session state
    const totalQueueCount = session?.lazyLoadInfo?.totalCount || session?.queue?.length || 0;
    console.log(`[QueueMsg] Session state:`, {
        hasSession: !!session,
        hasQueue: !!session?.queue,
        queueLength: session?.queue?.length || 0,
        totalQueueCount: totalQueueCount,
        hasNowPlaying: !!session?.nowPlaying,
        nowPlayingTitle: session?.nowPlaying?.title || 'None',
        hasQueueMessage: !!session?.queueMessage,
        queueMessageId: session?.queueMessage?.messageId || 'None'
    });
    
    if (displayPref === 'menu' && !forceNew) {
        console.log(`[QueueMsg] Guild ${guildId} is in 'menu' mode. Suppressing chat message update.`);
        return; // This is critical: prevents chat message update in 'menu' mode
    }

    if (!session) {
        console.warn(`[QueueMsg] No session provided for guild ${guildId} to update message.`);
        return;
    }

    // LOCK MECHANISM: Prevent concurrent queue message operations
    if (queueMessageLocks.has(guildId)) {
        console.log(`[QueueMsg] Guild ${guildId} is already processing queue message, waiting...`);
        await queueMessageLocks.get(guildId);
        return;
    }

    const lockPromise = new Promise(async (resolve) => {
        try {
            const connection = getVoiceConnection(guildId);
            const isStopped = !connection || connection.state.status === 'destroyed' || connection.state.status === 'disconnected';
            
            console.log(`[QueueMsg] Connection status for guild ${guildId}: ${connection?.state?.status}, isStopped: ${isStopped}`);
            
            const payload = await formatQueueMessagePayload(session, isStopped, guildId);
            console.log(`[QueueMsg] Generated payload for guild ${guildId}:`, payload ? 'valid' : 'null');
            
            // If payload is null (bot is stopped or no content), delete any existing queue message and return
            if (payload === null) {
                console.log(`[QueueMsg] Bot is stopped or no content for guild ${guildId}, cleaning up queue message`);
                if (session.queueMessage && session.queueMessage.messageId) {
                    try {
                        const channel = await djsClient.channels.fetch(session.queueMessage.channelId);
                        if (channel && channel.isTextBased()) {
                            await channel.messages.delete(session.queueMessage.messageId);
                            console.log(`[QueueMsg] Deleted queue message ${session.queueMessage.messageId} for stopped bot in guild ${guildId}`);
                        }
                    } catch (error) {
                        console.error(`[QueueMsg] Error deleting queue message for stopped bot in guild ${guildId}:`, error.message);
                    }
                    session.queueMessage = null;
                }
                resolve();
                return;
            }

            // IMPROVED: Better logic for updating vs creating queue messages
            let shouldCreateNew = forceNew;
            let existingMessage = null;
            
            // Check if we have an existing message to update
            if (session.queueMessage && session.queueMessage.messageId && !forceNew) {
                console.log(`[QueueMsg] Found existing queue message ${session.queueMessage.messageId} for guild ${guildId}`);
                try {
                    const channel = await djsClient.channels.fetch(session.queueMessage.channelId);
                    if (channel && channel.isTextBased()) {
                        existingMessage = await channel.messages.fetch(session.queueMessage.messageId);
                        console.log(`[QueueMsg] Successfully fetched existing message for guild ${guildId}`);
                    } else {
                        console.warn(`[QueueMsg] Channel ${session.queueMessage.channelId} not found or not text-based, will create new message`);
                        shouldCreateNew = true;
                        session.queueMessage = null;
                    }
                } catch (error) {
                    console.error(`[QueueMsg] Error fetching existing message ${session.queueMessage.messageId} for guild ${guildId}:`, error.message);
                    if (error.code === 10008 || error.code === 10003) { // Unknown message or channel
                        console.log(`[QueueMsg] Message or channel not found, will create new message`);
                        shouldCreateNew = true;
                        session.queueMessage = null;
                    } else {
                        // For other errors, try to update anyway
                        shouldCreateNew = false;
                    }
                }
            } else {
                shouldCreateNew = true;
            }

            // Try to update existing message first
            if (existingMessage && !shouldCreateNew) {
                console.log(`[QueueMsg] Attempting to update existing queue message ${session.queueMessage.messageId} for guild ${guildId}`);
                try {
                    await existingMessage.edit(payload);
                    console.log(`[QueueMsg] Successfully updated existing queue message ${session.queueMessage.messageId} for guild ${guildId}`);
                    resolve();
                    return; // Successfully updated, exit early
                } catch (error) {
                    console.error(`[QueueMsg] Error editing existing message ${session.queueMessage.messageId} for guild ${guildId}:`, error.message);
                    // If edit fails, fall back to creating a new message
                    shouldCreateNew = true;
                    session.queueMessage = null;
                }
            }

            // Only create new message if we need to and we're in chat mode
            if (shouldCreateNew && displayPref === 'chat' && session.lastPlayCommandChannelId) {
                console.log(`[QueueMsg] Creating new queue message for guild ${guildId}`);
                try {
                    const channel = await djsClient.channels.fetch(session.lastPlayCommandChannelId);
                    if (channel && channel.isTextBased()) {
                        const msg = await channel.send(payload);
                        session.queueMessage = { messageId: msg.id, channelId: msg.channelId };
                        
                        // Update the global session immediately to prevent duplicates
                        const { guildAudioSessions } = await import('../utils/core/audio-state.js');
                        const globalSession = guildAudioSessions.get(guildId);
                        if (globalSession) {
                            globalSession.queueMessage = session.queueMessage;
                            guildAudioSessions.set(guildId, globalSession);
                            console.log(`[QueueMsg] Updated global session with new queue message ${msg.id} for guild ${guildId}`);
                        }
                        
                        console.log(`[QueueMsg] Created new queue message ${msg.id} for guild ${guildId}.`);
                    }
                } catch (error) {
                    console.error(`[QueueMsg] Error creating new queue message for guild ${guildId}:`, error.message);
                }
            } else if (!shouldCreateNew) {
                console.log(`[QueueMsg] No new message needed for guild ${guildId}: displayPref=${displayPref}, hasChannel=${!!session.lastPlayCommandChannelId}`);
            } else {
                console.log(`[QueueMsg] Skipping new message creation for guild ${guildId}: displayPref=${displayPref}, hasChannel=${!!session.lastPlayCommandChannelId}, shouldCreateNew=${shouldCreateNew}`);
            }
        } catch (error) {
            console.error(`[QueueMsg] Error in queue message update for guild ${guildId}:`, error.message);
        } finally {
            resolve();
        }
    });

    queueMessageLocks.set(guildId, lockPromise);
    await lockPromise;
    queueMessageLocks.delete(guildId);
}

// NEW: Function to force update queue message when queue changes
export async function forceUpdateQueueMessage(guildId, djsClient, session) {
    console.log(`[QueueMsg] forceUpdateQueueMessage called for guild ${guildId}`);
    
    if (!session) {
        console.warn(`[QueueMsg] No session provided for guild ${guildId} to force update message.`);
        return;
    }
    
    // Always force update regardless of display preference
    await updatePersistentQueueMessage(guildId, djsClient, session, true);
}

// NEW: Function to ensure queue message is visible in chat mode
export async function ensureQueueMessageVisible(guildId, djsClient, session) {
    console.log(`[QueueMsg] ensureQueueMessageVisible called for guild ${guildId}`);
    
    if (!session) {
        console.warn(`[QueueMsg] No session provided for guild ${guildId} to ensure message visibility.`);
        return;
    }
    
    const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
    
    if (displayPref === 'chat') {
        // Only create/update if we don't have a queue message, don't force new ones
        if (!session.queueMessage) {
            await updatePersistentQueueMessage(guildId, djsClient, session, false);
        }
    }
}

// NEW: Function to completely clean up queue messages when sessions end
export async function cleanupQueueMessageOnSessionEnd(guildId, djsClient, session) {
    if (!session || !session.queueMessage || !session.queueMessage.messageId) {
        console.log(`[CleanupSessionEnd] No queue message to clean up for guild ${guildId}`);
        return;
    }

    try {
        console.log(`[CleanupSessionEnd] Cleaning up queue message ${session.queueMessage.messageId} for guild ${guildId}`);
        
        const channel = await djsClient.channels.fetch(session.queueMessage.channelId);
        if (channel && channel.isTextBased()) {
            await channel.messages.delete(session.queueMessage.messageId);
            console.log(`[CleanupSessionEnd] Successfully deleted queue message ${session.queueMessage.messageId} for guild ${guildId}`);
        }
        
        // Clear the queue message reference
        session.queueMessage = null;
        
        // Update global session
        const { guildAudioSessions } = await import('../utils/audio-state.js');
        const globalSession = guildAudioSessions.get(guildId);
        if (globalSession) {
            globalSession.queueMessage = null;
            guildAudioSessions.set(guildId, globalSession);
        }
        
    } catch (error) {
        console.error(`[CleanupSessionEnd] Error cleaning up queue message for guild ${guildId}:`, error.message);
        // Even if deletion fails, clear the reference to prevent future issues
        session.queueMessage = null;
    }
}

// Simple function to start/stop periodic cleanup (no-op for now)
export function startPeriodicQueueCleanup(djsClient) {
    console.log(`[QueueMsg] Periodic cleanup disabled - using simplified queue management`);
}

export function stopPeriodicQueueCleanup() {
    console.log(`[QueueMsg] Periodic cleanup stopped`);
}