// routers/query-router.js
/**
 * Query Router
 * 
 * Routes play queries to appropriate handlers based on URL patterns
 * - Spotify playlists → spotify-playlist-handler.js
 * - Spotify tracks → unified-media-handler.js
 * - YouTube playlists → youtube-playlist-handler.js
 * - YouTube tracks → unified-media-handler.js
 * - Search queries → unified-media-handler.js
 */

/**
 * Route play query to appropriate handler
 * @param {Object} djsClient - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} member - Discord member
 * @param {string} channelId - Channel ID
 * @param {string} query - Query string (URL or search term)
 * @param {Object} interactionDetails - Interaction details
 * @param {string} displayPref - Display preference ('chat' or 'menu')
 * @returns {Object} Result object with success/error status
 */
export async function routePlayQuery(djsClient, guildId, member, channelId, query, interactionDetails, displayPref = 'chat') {
    console.log(`[QueryRouter] Routing query: "${query}" for guild ${guildId}`);
    
    // Check if this is a Spotify playlist URL
    if (query.includes('open.spotify.com/playlist/')) {
        console.log(`[QueryRouter] Detected Spotify playlist, routing to Spotify handler`);
        try {
            const { handleSpotifyPlaylist } = await import('../handlers/media/spotify-playlist.js');
            return await handleSpotifyPlaylist(djsClient, guildId, member, channelId, query, interactionDetails);
        } catch (error) {
            console.error('[QueryRouter] Error importing Spotify handler:', error);
            return { success: false, error: 'Failed to load Spotify playlist handler' };
        }
    }
    
    // Check if this is a Spotify track URL or URI
    if (query.includes('open.spotify.com/track/') || query.startsWith('spotify:track:')) {
        console.log(`[QueryRouter] Detected Spotify track, routing to unified media handler`);
        try {
            const { handleSpotifyTrack } = await import('../handlers/core/unified-media-handler.js');
            return await handleSpotifyTrack(djsClient, guildId, member, channelId, query, interactionDetails, displayPref);
        } catch (error) {
            console.error('[QueryRouter] Error importing unified media handler:', error);
            return { success: false, error: 'Failed to load unified media handler' };
        }
    }
    
    // Check if this is a YouTube playlist URL
    if (query.includes('youtube.com/playlist?list=') || (query.includes('youtube.com/watch?v=') && query.includes('&list='))) {
        console.log(`[QueryRouter] Detected YouTube playlist, routing to YouTube handler`);
        try {
            const { handleYouTubePlaylist } = await import('../handlers/media/youtube-playlist.js');
            return await handleYouTubePlaylist(djsClient, guildId, member, channelId, query, interactionDetails);
        } catch (error) {
            console.error('[QueryRouter] Error importing YouTube handler:', error);
            return { success: false, error: 'Failed to load YouTube handler' };
        }
    }
    
    // Check if this is a YouTube single track URL
    if (query.includes('youtube.com/watch?v=') || query.includes('youtu.be/')) {
        console.log(`[QueryRouter] Detected YouTube track, routing to unified media handler`);
        try {
            const { handleYouTubeTrack } = await import('../handlers/core/unified-media-handler.js');
            return await handleYouTubeTrack(djsClient, guildId, member, channelId, query, interactionDetails, displayPref);
        } catch (error) {
            console.error('[QueryRouter] Error importing unified media handler:', error);
            return { success: false, error: 'Failed to load unified media handler' };
        }
    }
    
    // Default: route to unified media handler for search queries
    console.log(`[QueryRouter] Routing to unified media handler for search query`);
    try {
        const { handleSearchQuery } = await import('../handlers/core/unified-media-handler.js');
        return await handleSearchQuery(djsClient, guildId, member, channelId, query, interactionDetails, displayPref);
    } catch (error) {
        console.error('[QueryRouter] Error importing unified media handler:', error);
        return { success: false, error: 'Failed to load unified media handler' };
    }
}

/**
 * Get serializable session data for database storage
 * @param {Object} session - Audio session
 * @returns {Object} Serializable session data
 */
export function getSerializableSession(session) {
    if (!session) return null;
    
    return {
        nowPlaying: session.nowPlaying,
        queue: session.queue || [],
        history: session.history || [],
        lazyLoadInfo: session.lazyLoadInfo
    };
}
