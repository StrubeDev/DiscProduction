// utils/database/guildQueues.js
import { getPool } from './index.js';


/**
 * Creates a serializable version of song data by removing circular references
 */
function createSerializableSong(song) {
    if (!song) return null;
    
    return {
        title: song.title || 'Unknown Title',
        query: song.query || '',
        addedBy: song.addedBy || 'Unknown User',
        thumbnailUrl: song.thumbnailUrl || null,
        // PRESERVE PRELOAD DATA
        preloadedTempFile: song.preloadedTempFile || null,
        preloadedMetadata: song.preloadedMetadata || null,
        preloadCompleted: song.preloadCompleted || false,
        isPreloading: song.isPreloading || false,
        // REMOVE ALL CIRCULAR REFERENCES
        spotifyData: null, // Remove heavy data
        streamDetails: null, // Remove process references
        metadata: null, // Remove heavy metadata
        cachedData: null, // Remove cached data
        originalSpotifyUrl: song.originalSpotifyUrl || null,
        youtubeUrl: song.youtubeUrl || null,
        actualYouTubeTitle: song.actualYouTubeTitle || null,
        // Remove any process references
        ytDlpProcess: null,
        ffmpegProcess: null
    };
}

/**
 * Saves the current playback session data for a guild.
 * The session data (nowPlaying, queue, history, lazyLoadInfo) is serialized to JSONB.
 */
export async function saveGuildQueue(guildId, sessionData) {
    const pool = getPool();

    // Create serializable versions to prevent circular reference errors
    let nowPlayingJson = null;
    let queueItemsJson = '[]';
    let historyItemsJson = '[]';
    let lazyLoadJson = '[]';
    let volumeJson = '100';
    const isMutedValue = sessionData.isMuted || false;
    
    try {
        nowPlayingJson = sessionData.nowPlaying ? JSON.stringify(createSerializableSong(sessionData.nowPlaying)) : null;
        queueItemsJson = JSON.stringify((sessionData.queue || []).map(createSerializableSong));
        historyItemsJson = JSON.stringify((sessionData.history || []).map(createSerializableSong));
        lazyLoadJson = sessionData.lazyLoadInfo ? JSON.stringify(sessionData.lazyLoadInfo) : 'null';
        volumeJson = sessionData.volume ? JSON.stringify(sessionData.volume) : '100';
    } catch (serializationError) {
        console.error(`[Database] ❌ Serialization error for guild ${guildId}:`, serializationError.message);
        console.error(`[Database] 🔍 Session data keys:`, Object.keys(sessionData));
        
        // Fallback to minimal data
        nowPlayingJson = sessionData.nowPlaying ? JSON.stringify({
            title: sessionData.nowPlaying.title || 'Unknown',
            query: sessionData.nowPlaying.query || '',
            addedBy: sessionData.nowPlaying.addedBy || 'Unknown'
        }) : null;
        queueItemsJson = JSON.stringify((sessionData.queue || []).map(song => ({
            title: song.title || 'Unknown',
            query: song.query || '',
            addedBy: song.addedBy || 'Unknown'
        })));
        historyItemsJson = '[]';
        lazyLoadJson = '[]';
        volumeJson = '100';
    }

    return pool.query(
        `INSERT INTO guild_queues (guild_id, now_playing, queue_items, history_items, lazy_load_queue, volume, is_muted, last_updated)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id) DO UPDATE SET
         now_playing = $2::jsonb,
         queue_items = $3::jsonb,
         history_items = $4::jsonb,
         lazy_load_queue = $5::jsonb,
         volume = $6::jsonb,
         is_muted = $7,
         last_updated = CURRENT_TIMESTAMP`,
        [
            guildId,
            nowPlayingJson,
            queueItemsJson,
            historyItemsJson,
            lazyLoadJson, // --- NEW ---
            volumeJson, // --- NEW ---
            isMutedValue // --- NEW ---
        ]
    );
}

/**
 * Retrieves the stored playback session data for a guild.
 */
export async function getGuildQueue(guildId) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM guild_queues WHERE guild_id = $1', [guildId]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
        nowPlaying: row.now_playing || null,
        queue: Array.isArray(row.queue_items) ? row.queue_items : [],
        history: Array.isArray(row.history_items) ? row.history_items : [],
        // --- FIXED: Properly deserialize lazy load info ---
        lazyLoadInfo: row.lazy_load_queue ? (typeof row.lazy_load_queue === 'object' ? row.lazy_load_queue : { tracks: Array.isArray(row.lazy_load_queue) ? row.lazy_load_queue : [] }) : null,
        // --- NEW: Deserialize volume ---
        volume: row.volume || 100,
        // --- NEW: Deserialize is_muted ---
        isMuted: row.is_muted || false
    };
}

/**
 * --- COMPLETELY NEW FUNCTION ---
 * Atomically retrieves the first song from the lazy_load_queue and removes it.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<Object|null>} The next song object, or null if the queue is empty.
 */
export async function fetchAndRemoveNextLazySong(guildId) {
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get the current lazy load queue
        const selectRes = await client.query('SELECT lazy_load_queue FROM guild_queues WHERE guild_id = $1 FOR UPDATE', [guildId]);

        if (selectRes.rows.length === 0 || !selectRes.rows[0].lazy_load_queue || selectRes.rows[0].lazy_load_queue.length === 0) {
            await client.query('COMMIT');
            return null; // No songs in the lazy queue
        }

        let lazyQueue = selectRes.rows[0].lazy_load_queue;
        const nextSong = lazyQueue.shift(); // Get the first song and remove it from the array

        // Update the database with the modified (shorter) queue
        await client.query('UPDATE guild_queues SET lazy_load_queue = $1 WHERE guild_id = $2', [JSON.stringify(lazyQueue), guildId]);

        await client.query('COMMIT');
        return nextSong;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(`[DB-LazyLoad] Error fetching next song for guild ${guildId}:`, e);
        return null;
    } finally {
        client.release();
    }
}