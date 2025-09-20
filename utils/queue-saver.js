// utils/queue-saver.js
import { getPool } from './database/index.js';

/**
 * Queue Saver - Background service for saving/loading playlists
 * 
 * Key features:
 * - Watches session queues for changes
 * - Saves playlists to database when requested
 * - Loads playlists from database when requested
 * - No interference with fast session queue operations
 */

class QueueSaver {
    constructor() {
        this.savedPlaylists = new Map(); // Cache for loaded playlists
        this.autoSaveEnabled = new Map(); // Per-guild auto-save settings
        
        // Create table if it doesn't exist
        this.initializeTable();
    }

    /**
     * Clean up data for a specific guild
     */
    cleanupGuildData(guildId) {
        console.log(`[QueueSaver] 🧹 COMPREHENSIVE CLEANUP: Removing all data for guild ${guildId}`);
        
        let cleanedCount = 0;
        
        // Clear saved playlists cache
        if (this.savedPlaylists.has(guildId)) {
            this.savedPlaylists.delete(guildId);
            cleanedCount++;
        }
        
        // Clear auto-save settings
        if (this.autoSaveEnabled.has(guildId)) {
            this.autoSaveEnabled.delete(guildId);
            cleanedCount++;
        }
        
        console.log(`[QueueSaver] ✅ COMPREHENSIVE CLEANUP COMPLETE for guild ${guildId} (${cleanedCount} entries cleaned)`);
    }

    /**
     * Clean up old data to prevent memory leaks
     */
    cleanupOldData() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        let cleanedCount = 0;
        
        // Clean up old saved playlists cache
        for (const [guildId, data] of this.savedPlaylists) {
            if (now - data.timestamp > maxAge) {
                this.savedPlaylists.delete(guildId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[QueueSaver] 🧹 Cleaned up ${cleanedCount} old cache entries`);
        }
    }
    
    /**
     * Initialize the saved playlists table
     */
    async initializeTable() {
        try {
            const pool = getPool();
            await pool.query(`
                CREATE TABLE IF NOT EXISTS saved_playlists (
                    id SERIAL PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    playlist_name TEXT NOT NULL,
                    songs JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT,
                    UNIQUE(guild_id, playlist_name)
                )
            `);
            
            // Create indexes
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_saved_playlists_guild ON saved_playlists(guild_id);
                CREATE INDEX IF NOT EXISTS idx_saved_playlists_name ON saved_playlists(playlist_name);
            `);
            
            console.log('[QueueSaver] Database table initialized');
        } catch (error) {
            console.error('[QueueSaver] Error initializing table:', error);
        }
    }
    
    /**
     * Save current session queue as a playlist
     */
    async savePlaylist(guildId, playlistName, session, createdBy = 'Unknown') {
        try {
            if (!session.queue || session.queue.length === 0) {
                throw new Error('No songs in queue to save');
            }
            
            const songs = session.queue.map(song => ({
                title: song.title,
                query: song.query,
                addedBy: song.addedBy,
                // Don't save stream details - they expire anyway
            }));
            
            const pool = getPool();
            const result = await pool.query(`
                INSERT INTO saved_playlists (guild_id, playlist_name, songs, created_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (guild_id, playlist_name) DO UPDATE SET
                    songs = EXCLUDED.songs,
                    updated_at = CURRENT_TIMESTAMP,
                    created_by = EXCLUDED.created_by
                RETURNING id
            `, [guildId, playlistName, JSON.stringify(songs), createdBy]);
            
            // Cache the saved playlist
            this.savedPlaylists.set(`${guildId}-${playlistName}`, {
                id: result.rows[0].id,
                songs: songs,
                createdAt: new Date(),
                createdBy: createdBy
            });
            
            console.log(`[QueueSaver] Saved playlist "${playlistName}" for guild ${guildId} with ${songs.length} songs`);
            return { success: true, playlistId: result.rows[0].id };
            
        } catch (error) {
            console.error(`[QueueSaver] Error saving playlist:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Save cached Spotify playlist from session
     */
    async saveSpotifyPlaylist(guildId, playlistName, session, createdBy = 'Unknown') {
        try {
            if (!session.currentPlaylist?.cachedSongs || session.currentPlaylist.cachedSongs.length === 0) {
                throw new Error('No cached Spotify playlist to save');
            }
            
            const songs = session.currentPlaylist.cachedSongs.map(song => ({
                title: song.title,
                query: song.query,
                addedBy: song.addedBy,
                spotifyInfo: song.spotifyInfo, // Include Spotify metadata
                // Don't save stream details - they expire anyway
            }));
            
            const pool = getPool();
            const result = await pool.query(`
                INSERT INTO saved_playlists (guild_id, playlist_name, songs, created_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (guild_id, playlist_name) DO UPDATE SET
                    songs = EXCLUDED.songs,
                    updated_at = CURRENT_TIMESTAMP,
                    created_by = EXCLUDED.created_by
                RETURNING id
            `, [guildId, playlistName, JSON.stringify(songs), createdBy]);
            
            // Cache the saved playlist
            this.savedPlaylists.set(`${guildId}-${playlistName}`, {
                id: result.rows[0].id,
                songs: songs,
                createdAt: new Date(),
                createdBy: createdBy
            });
            
            console.log(`[QueueSaver] Saved Spotify playlist "${playlistName}" for guild ${guildId} with ${songs.length} songs`);
            return { success: true, playlistId: result.rows[0].id };
            
        } catch (error) {
            console.error(`[QueueSaver] Error saving Spotify playlist:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Load a saved playlist into session queue
     */
    async loadPlaylist(guildId, playlistName, session) {
        try {
            // Check cache first
            const cached = this.savedPlaylists.get(`${guildId}-${playlistName}`);
            let songs;
            
            if (cached) {
                songs = cached.songs;
                console.log(`[QueueSaver] Loaded playlist "${playlistName}" from cache for guild ${guildId}`);
            } else {
                // Load from database
                const pool = getPool();
                const result = await pool.query(`
                    SELECT songs FROM saved_playlists 
                    WHERE guild_id = $1 AND playlist_name = $2
                `, [guildId, playlistName]);
                
                if (result.rows.length === 0) {
                    throw new Error(`Playlist "${playlistName}" not found`);
                }
                
                songs = result.rows[0].songs;
                
                // Cache the result
                this.savedPlaylists.set(`${guildId}-${playlistName}`, {
                    songs: songs,
                    createdAt: new Date()
                });
                
                console.log(`[QueueSaver] Loaded playlist "${playlistName}" from database for guild ${guildId}`);
            }
            
            // Add songs to session queue
            if (!session.queue) session.queue = [];
            
            // Clear existing queue and add playlist songs
            session.queue = songs.map(song => ({
                ...song,
                // These will be filled when the song actually plays
                streamDetails: null
            }));
            
            console.log(`[QueueSaver] Loaded ${songs.length} songs into session queue for guild ${guildId}`);
            return { success: true, songCount: songs.length };
            
        } catch (error) {
            console.error(`[QueueSaver] Error loading playlist:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * List all saved playlists for a guild
     */
    async listPlaylists(guildId) {
        try {
            const pool = getPool();
            const result = await pool.query(`
                SELECT playlist_name, songs, created_at, created_by, updated_at
                FROM saved_playlists 
                WHERE guild_id = $1
                ORDER BY updated_at DESC
            `, [guildId]);
            
            return result.rows.map(row => ({
                name: row.playlist_name,
                songCount: row.songs.length,
                createdAt: row.created_at,
                createdBy: row.created_by,
                updatedAt: row.updated_at
            }));
            
        } catch (error) {
            console.error(`[QueueSaver] Error listing playlists:`, error);
            return [];
        }
    }
    
    /**
     * Delete a saved playlist
     */
    async deletePlaylist(guildId, playlistName) {
        try {
            const pool = getPool();
            const result = await pool.query(`
                DELETE FROM saved_playlists 
                WHERE guild_id = $1 AND playlist_name = $2
                RETURNING id
            `, [guildId, playlistName]);
            
            if (result.rows.length === 0) {
                throw new Error(`Playlist "${playlistName}" not found`);
            }
            
            // Remove from cache
            this.savedPlaylists.delete(`${guildId}-${playlistName}`);
            
            console.log(`[QueueSaver] Deleted playlist "${playlistName}" for guild ${guildId}`);
            return { success: true };
            
        } catch (error) {
            console.error(`[QueueSaver] Error deleting playlist:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Enable/disable auto-save for a guild
     */
    setAutoSave(guildId, enabled) {
        this.autoSaveEnabled.set(guildId, enabled);
        console.log(`[QueueSaver] Auto-save ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
    }
    
    /**
     * Get auto-save status for a guild
     */
    getAutoSaveStatus(guildId) {
        return this.autoSaveEnabled.get(guildId) || false;
    }
}

// Export singleton instance
export const queueSaver = new QueueSaver();

