import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js';

// A simple and effective array shuffling algorithm (Fisher-Yates shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export async function handleShuffleCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.queue || session.queue.length < 2) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ There are not enough songs in the queue to shuffle.',
                flags: 64 // Ephemeral
            },
        });
    }

    // SHUFFLE WITH MEMORY-EFFICIENT APPROACH
    console.log(`[ShuffleCommand] Shuffling queue for guild ${guildId}`);
    
    try {
        const { getGuildQueue, saveGuildQueue } = await import('../utils/database/guildQueues.js');
        
        // Get all songs from database (including in-memory ones)
        const dbData = await getGuildQueue(guildId);
        let allSongs = [...session.queue]; // Start with in-memory songs
        
        // CRITICAL: Capture original memory songs for thumbnail preservation
        const originalMemorySongs = [...session.queue];
        
        console.log(`[ShuffleCommand] Memory songs: ${session.queue.length}`);
        console.log(`[ShuffleCommand] Database songs: ${dbData?.queue?.length || 0}`);
        
        // Add database songs if they exist
        if (dbData && dbData.queue && dbData.queue.length > 0) {
            allSongs = [...allSongs, ...dbData.queue];
        }
        
        console.log(`[ShuffleCommand] Combined songs before deduplication: ${allSongs.length}`);
        
        // CRITICAL FIX: Remove duplicates based on title and query
        const seen = new Set();
        allSongs = allSongs.filter(song => {
            const key = `${song.title}|${song.query}`;
            if (seen.has(key)) {
                console.log(`[ShuffleCommand] Removing duplicate: ${song.title}`);
                return false;
            }
            seen.add(key);
            return true;
        });
        
        console.log(`[ShuffleCommand] Found ${allSongs.length} total songs to shuffle (after deduplication)`);
        
        // Shuffle the complete queue
        shuffleArray(allSongs);
        console.log(`[ShuffleCommand] ✅ Shuffled ${allSongs.length} songs`);
        
        // Don't save to database yet - we'll save after splitting
        
        // CRITICAL: Clear all in-memory song data since the order changed
        console.log(`[ShuffleCommand] 🧹 CLEARING IN-MEMORY DATA: Old song data is now useless due to shuffle`);
        
        // Clear streamDetails and heavy data from any remaining in-memory songs
        for (const song of session.queue) {
            if (song.streamDetails) {
                // Clear heavy stream data
                if (song.streamDetails.audioResource) {
                    try {
                        if (song.streamDetails.audioResource.destroy) {
                            song.streamDetails.audioResource.destroy();
                        }
                    } catch (e) { /* ignore */ }
                    song.streamDetails.audioResource = null;
                }
                if (song.streamDetails.audioStream) {
                    try {
                        if (song.streamDetails.audioStream.destroy) {
                            song.streamDetails.audioStream.destroy();
                        }
                    } catch (e) { /* ignore */ }
                    song.streamDetails.audioStream = null;
                }
                if (song.streamDetails.ffmpegProcess) {
                    try {
                        if (!song.streamDetails.ffmpegProcess.killed) {
                            song.streamDetails.ffmpegProcess.kill('SIGTERM');
                        }
                    } catch (e) { /* ignore */ }
                    song.streamDetails.ffmpegProcess = null;
                }
                song.streamDetails = null;
            }
            
            // Clear preloaded data
            song.preloadedTempFile = null;
            song.preloadedMetadata = null;
            song.preloadCompleted = false;
        }
        
        // Clear in-memory queue completely
        session.queue = [];
        session.lazyLoadInfo = {
            inMemoryCount: 0,
            totalCount: allSongs.length,
            lastUpdated: Date.now(),
            shuffled: true
        };
        
        // Load first 3 songs from shuffled database (preserve thumbnails)
        if (allSongs.length > 0) {
            const firstThreeSongs = allSongs.slice(0, 3);
            const remainingSongs = allSongs.slice(3);
            
            // CRITICAL FIX: Preserve thumbnailUrl from original memory songs
            const thumbnailMap = new Map();
            originalMemorySongs.forEach(song => {
                if (song.thumbnailUrl) {
                    thumbnailMap.set(song.title, song.thumbnailUrl);
                }
            });
            
            // Restore thumbnails for songs that were in memory
            firstThreeSongs.forEach(song => {
                if (thumbnailMap.has(song.title)) {
                    song.thumbnailUrl = thumbnailMap.get(song.title);
                    console.log(`[ShuffleCommand] Preserved thumbnail for: ${song.title}`);
                }
            });
            
            // Update session with first 3 songs (with preserved thumbnails)
            session.queue = firstThreeSongs;
            session.lazyLoadInfo.inMemoryCount = firstThreeSongs.length;
            
            // Save ONLY remaining songs to database (first 3 are in memory)
            await saveGuildQueue(guildId, {
                nowPlaying: session.nowPlaying,
                queue: remainingSongs, // Save ONLY remaining songs to database
                history: session.history || [],
                lazyLoadInfo: session.lazyLoadInfo
            });
            
            console.log(`[ShuffleCommand] ✅ Shuffle complete: Cleared old data, loaded fresh first 3 songs (${firstThreeSongs.length} in memory, ${remainingSongs.length} in database)`);
        }
        
    } catch (error) {
        console.error(`[ShuffleCommand] Error during shuffle:`, error.message);
        // Fallback to simple in-memory shuffle
        shuffleArray(session.queue);
        console.log(`[ShuffleCommand] Fallback: Shuffled ${session.queue.length} in-memory songs only`);
    }
    
    // FIXED: Emit queue change event to update BOTH queue panel and chat message
    _djsClient.emit('queueChanged', guildId, session);
    
    // UPDATE PLAYBACK CONTROLS EMBED when queue is shuffled
    try {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        await updatePlaybackControlsEmbed(guildId, _djsClient, session);
    } catch (error) {
        console.error('[ShuffleCommand] Error updating playback controls embed:', error.message);
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '🔀 The queue has been successfully shuffled.',
            flags: 64, // Ephemeral
        },
    });
}