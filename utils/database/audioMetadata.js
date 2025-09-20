// utils/database/audioMetadata.js
import { getPool } from './index.js';

/**
 * Audio metadata cache table structure:
 * - Stores metadata (title, duration, thumbnail, uploader, etc.)
 * - Caches stream URLs with expiration times
 * - Avoids storing large audio files or raw streams
 */

export async function createAudioMetadataTable() {
    const pool = getPool();
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS audio_metadata (
            id SERIAL PRIMARY KEY,
            query_hash TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            duration_seconds INTEGER,
            thumbnail_url TEXT,
            uploader TEXT,
            source_url TEXT,
            stream_url TEXT,
            stream_url_expires_at TIMESTAMP,
            metadata_extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            play_count INTEGER DEFAULT 0,
            last_played_at TIMESTAMP,
            file_size_bytes BIGINT,
            format_info JSONB,
            additional_metadata JSONB
        )
    `);
    
    // Create indexes for performance
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audio_metadata_query_hash ON audio_metadata(query_hash);
        CREATE INDEX IF NOT EXISTS idx_audio_metadata_expires ON audio_metadata(stream_url_expires_at);
        CREATE INDEX IF NOT EXISTS idx_audio_metadata_play_count ON audio_metadata(play_count);
    `);
}

/**
 * Store or update audio metadata
 */
export async function storeAudioMetadata(metadata) {
    const pool = getPool();
    
    const {
        queryHash,
        title,
        durationSeconds,
        thumbnailUrl,
        uploader,
        sourceUrl,
        streamUrl,
        streamUrlExpiresAt,
        fileSizeBytes,
        formatInfo,
        additionalMetadata
    } = metadata;
    
    const result = await pool.query(`
        INSERT INTO audio_metadata (
            query_hash, title, duration_seconds, thumbnail_url, uploader, 
            source_url, stream_url, stream_url_expires_at, file_size_bytes, 
            format_info, additional_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (query_hash) DO UPDATE SET
            title = EXCLUDED.title,
            duration_seconds = EXCLUDED.duration_seconds,
            thumbnail_url = EXCLUDED.thumbnail_url,
            uploader = EXCLUDED.uploader,
            source_url = EXCLUDED.source_url,
            stream_url = EXCLUDED.stream_url,
            stream_url_expires_at = EXCLUDED.stream_url_expires_at,
            file_size_bytes = EXCLUDED.file_size_bytes,
            format_info = EXCLUDED.format_info,
            additional_metadata = EXCLUDED.additional_metadata,
            metadata_extracted_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [
        queryHash, title, durationSeconds, thumbnailUrl, uploader,
        sourceUrl, streamUrl, streamUrlExpiresAt, fileSizeBytes,
        JSON.stringify(formatInfo), JSON.stringify(additionalMetadata)
    ]);
    
    return result.rows[0].id;
}

/**
 * Retrieve audio metadata by query hash
 */
export async function getAudioMetadata(queryHash) {
    const pool = getPool();
    
    const result = await pool.query(`
        SELECT * FROM audio_metadata 
        WHERE query_hash = $1 
        AND (stream_url_expires_at IS NULL OR stream_url_expires_at > CURRENT_TIMESTAMP)
    `, [queryHash]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
        id: row.id,
        queryHash: row.query_hash,
        title: row.title,
        durationSeconds: row.duration_seconds,
        thumbnailUrl: row.thumbnail_url,
        uploader: row.uploader,
        sourceUrl: row.source_url,
        streamUrl: row.stream_url,
        streamUrlExpiresAt: row.stream_url_expires_at,
        metadataExtractedAt: row.metadata_extracted_at,
        playCount: row.play_count,
        lastPlayedAt: row.last_played_at,
        fileSizeBytes: row.file_size_bytes,
        formatInfo: row.format_info,
        additionalMetadata: row.additional_metadata
    };
}

/**
 * Update play count and last played timestamp
 */
export async function updatePlayStats(queryHash) {
    const pool = getPool();
    
    await pool.query(`
        UPDATE audio_metadata 
        SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP
        WHERE query_hash = $1
    `, [queryHash]);
}

/**
 * Clean up expired stream URLs
 */
export async function cleanupExpiredStreamUrls() {
    const pool = getPool();
    
    const result = await pool.query(`
        UPDATE audio_metadata 
        SET stream_url = NULL, stream_url_expires_at = NULL
        WHERE stream_url_expires_at < CURRENT_TIMESTAMP
        RETURNING id
    `);
    
    return result.rows.length;
}

/**
 * Get metadata by title similarity (for search)
 */
export async function searchAudioMetadata(searchTerm, limit = 10) {
    const pool = getPool();
    
    const result = await pool.query(`
        SELECT * FROM audio_metadata 
        WHERE title ILIKE $1 
        ORDER BY play_count DESC, last_played_at DESC
        LIMIT $2
    `, [`%${searchTerm}%`, limit]);
    
    return result.rows.map(row => ({
        id: row.id,
        queryHash: row.query_hash,
        title: row.title,
        durationSeconds: row.duration_seconds,
        thumbnailUrl: row.thumbnail_url,
        uploader: row.uploader,
        playCount: row.play_count,
        lastPlayedAt: row.last_played_at
    }));
}

/**
 * Get recently played tracks
 */
export async function getRecentlyPlayed(limit = 20) {
    const pool = getPool();
    
    const result = await pool.query(`
        SELECT * FROM audio_metadata 
        WHERE last_played_at IS NOT NULL
        ORDER BY last_played_at DESC
        LIMIT $1
    `, [limit]);
    
    return result.rows.map(row => ({
        id: row.id,
        queryHash: row.query_hash,
        title: row.title,
        durationSeconds: row.duration_seconds,
        thumbnailUrl: row.thumbnail_url,
        uploader: row.uploader,
        playCount: row.play_count,
        lastPlayedAt: row.last_played_at
    }));
}

/**
 * Get most popular tracks
 */
export async function getMostPopular(limit = 20) {
    const pool = getPool();
    
    const result = await pool.query(`
        SELECT * FROM audio_metadata 
        WHERE play_count > 0
        ORDER BY play_count DESC
        LIMIT $1
    `, [limit]);
    
    return result.rows.map(row => ({
        id: row.id,
        queryHash: row.query_hash,
        title: row.title,
        durationSeconds: row.duration_seconds,
        thumbnailUrl: row.thumbnail_url,
        uploader: row.uploader,
        playCount: row.play_count,
        lastPlayedAt: row.last_played_at
    }));
}
