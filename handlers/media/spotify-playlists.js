import 'dotenv/config'; // Ensures your environment variables are loaded
import fetch from 'node-fetch'; // For making HTTP requests to the Spotify API

let spotifyToken = {
    value: null,
    expires: 0,
};

async function getSpotifyToken() {
    if (spotifyToken.value && spotifyToken.expires > Date.now()) {
        return spotifyToken.value;
    }
    console.log('[SpotifyAPI] Requesting new Spotify token.');
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('Spotify client ID or secret is not configured.');
    }
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        },
        body: 'grant_type=client_credentials',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get Spotify token: ${data.error_description}`);
    }
    spotifyToken = {
        value: data.access_token,
        expires: Date.now() + (data.expires_in - 300) * 1000,
    };
    return spotifyToken.value;
}

export async function getPlaylistTracks(playlistId) {
    let token;
    try {
        token = await getSpotifyToken();
    } catch (error) {
        console.error('[SpotifyAPI] Error obtaining token for playlist:', error.message);
        return [];
    }
    let allTracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(name,artists(name,images),album(name,images),duration_ms,id)),next&limit=50`;

    while (nextUrl) {
        try {
            const response = await fetch(nextUrl, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`[SpotifyAPI] Error fetching playlist page. Status: ${response.status}`, data);
                if (response.status === 401) spotifyToken.value = null; // Invalidate token on auth error
                return allTracks;
            }
            const simplifiedTracks = data.items
                .filter(item => item.track && item.track.name && item.track.artists)
                .map(item => {
                    const track = item.track;
                    const mainArtist = track.artists[0];
                    
                    // Prioritize album art over artist images for better 4:3 ratio
                    let albumArtUrl = null;
                    let artistImageUrl = null;
                    
                    if (track.album?.images && track.album.images.length > 0) {
                        // Look for the largest image that's not too square (prefer 4:3 ratio)
                        const albumImages = track.album.images;
                        let bestImage = albumImages[0]; // Default to largest
                        
                        // Look for images that might be more rectangular
                        for (const img of albumImages) {
                            if (img.width && img.height) {
                                const ratio = img.width / img.height;
                                // Prefer images closer to 4:3 ratio (1.33) over square (1.0)
                                if (ratio > 1.1) { // Wider than square
                                    bestImage = img;
                                    break;
                                }
                            }
                        }
                        
                        albumArtUrl = bestImage.url;
                    }
                    
                    // Fallback to artist image if no album art
                    if (!albumArtUrl && mainArtist?.images && mainArtist.images.length > 0) {
                        artistImageUrl = mainArtist.images[0].url;
                    }
                    
                    return {
                        title: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        // Add enhanced metadata
                        id: track.id,
                        album: track.album?.name || null,
                        albumArtUrl: albumArtUrl,
                        artistImageUrl: artistImageUrl,
                        duration: track.duration_ms
                    };
                });
            allTracks = allTracks.concat(simplifiedTracks);
            nextUrl = data.next;
        } catch (error) {
            console.error(`[SpotifyAPI] Network error fetching playlist page: ${error.message}`);
            return allTracks;
        }
    }
    console.log(`[SpotifyAPI] Fetched ${allTracks.length} tracks for playlist ID: ${playlistId}.`);
    return allTracks;
}

// ADDED: Function to get playlist information including name
export async function getPlaylistInfo(playlistId) {
    let token;
    try {
        token = await getSpotifyToken();
    } catch (error) {
        console.error('[SpotifyAPI] Error obtaining token for playlist info:', error.message);
        return null;
    }

    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) {
            console.error(`[SpotifyAPI] Error fetching playlist info. Status: ${response.status}`, data);
            if (response.status === 401) spotifyToken.value = null; // Invalidate token on auth error
            return null;
        }
        
        return {
            name: data.name,
            description: data.description,
            totalTracks: data.tracks.total,
            owner: data.owner.display_name,
            public: data.public,
            collaborative: data.collaborative
        };
    } catch (error) {
        console.error(`[SpotifyAPI] Network error fetching playlist info: ${error.message}`);
        return null;
    }
}
