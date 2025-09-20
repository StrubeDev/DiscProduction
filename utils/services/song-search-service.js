// utils/services/song-search-service.js
// Shared service for searching songs on YouTube based on track information

import { unifiedYtdlpService } from '../processors/unified-ytdlp-service.js';

/**
 * Search for a song on YouTube based on track information
 * This is used by both Spotify and YouTube track handlers
 * 
 * @param {Object} trackInfo - Track information object
 * @param {string} trackInfo.title - Song title
 * @param {string} trackInfo.artist - Artist name
 * @param {string} trackInfo.query - Original query (for YouTube tracks)
 * @param {string} guildId - Guild ID for rate limiting
 * @returns {Promise<Object>} - { youtubeUrl, searchQuery, error }
 */
export async function searchSongOnYouTube(trackInfo, guildId) {
    try {
        console.log(`[SongSearch] 🔍 Searching for: "${trackInfo.title}" by ${trackInfo.artist}`);
        
        let searchQuery;
        let youtubeUrl;
        
        // If we already have a YouTube URL (from YouTube track handler), use it directly
        if (trackInfo.query && (trackInfo.query.includes('youtube.com') || trackInfo.query.includes('youtu.be'))) {
            console.log(`[SongSearch] ✅ Using existing YouTube URL: ${trackInfo.query}`);
            return {
                youtubeUrl: trackInfo.query,
                searchQuery: trackInfo.query,
                error: null
            };
        }
        
        // For Spotify tracks or search queries, create a search query
        if (trackInfo.artist) {
            searchQuery = `${trackInfo.title} ${trackInfo.artist}`;
        } else {
            searchQuery = trackInfo.title;
        }
        
        console.log(`[SongSearch] 🔍 Searching YouTube for: "${searchQuery}"`);
        
        // Search for the song on YouTube
        youtubeUrl = await unifiedYtdlpService.searchSong(searchQuery, guildId);
        console.log(`[SongSearch] ✅ Found YouTube equivalent: ${youtubeUrl}`);
        
        return {
            youtubeUrl,
            searchQuery,
            error: null
        };
        
    } catch (error) {
        console.error(`[SongSearch] ❌ Failed to search for song:`, error.message);
        return {
            youtubeUrl: null,
            searchQuery: null,
            error: error.message
        };
    }
}

/**
 * Create a standardized song object from track information and YouTube URL
 * 
 * @param {Object} trackInfo - Track information
 * @param {string} youtubeUrl - YouTube URL for audio download
 * @param {string} searchQuery - Search query used
 * @param {Object} interactionDetails - Interaction details
 * @param {string} originalQuery - Original query (Spotify URL, YouTube URL, etc.)
 * @returns {Object} - Standardized song object
 */
export function createSongObject(trackInfo, youtubeUrl, searchQuery, interactionDetails, originalQuery) {
    return {
        title: trackInfo.title,
        artist: trackInfo.artist || 'Unknown Artist',
        duration: trackInfo.duration || 0,
        query: youtubeUrl, // Use YouTube URL for audio download
        addedBy: interactionDetails?.user?.username || 'Unknown User',
        addedById: interactionDetails?.user?.id || 'unknown',
        addedByAvatar: interactionDetails?.user?.avatar || null,
        imageUrl: trackInfo.imageUrl || null,
        
        // Store original data for reference
        originalQuery: originalQuery,
        searchQuery: searchQuery,
        
        // Store platform-specific data
        spotifyData: trackInfo.spotifyData || null,
        youtubeData: trackInfo.youtubeData || null,
        
        // Metadata
        album: trackInfo.album || null,
        genre: trackInfo.genre || null
    };
}
