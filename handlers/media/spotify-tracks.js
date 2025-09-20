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
// --- THIS IS THE NEW FUNCTION YOU NEED TO ADD ---
/**
 * Fetches details for a single Spotify track.
 * @param {string} trackId The ID of the Spotify track.
 * @returns {Promise<object|null>} A promise that resolves to an object with { title, artist }, or null on error.
 */
export async function getTrackDetails(trackId) {
    let token;
    try {
        token = await getSpotifyToken();
    } catch (error) {
        console.error('[SpotifyAPI] Error obtaining token for track details:', error.message);
        return null;
    }

    const url = `https://api.spotify.com/v1/tracks/${trackId}`;
    console.log(`[SpotifyAPI] Fetching details for track ID: ${trackId}`);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
            console.error(`[SpotifyAPI] Error fetching track details. Status: ${response.status}`, data);
            if (response.status === 401) spotifyToken.value = null;
            return null;
        }

        if (data && data.name && data.artists) {
            // Get the first artist's images (usually the main artist)
            const mainArtist = data.artists[0];
            let artistImageUrl = null;
            let albumArtUrl = null;
            
            // Prioritize album art over artist images (album art is often more rectangular)
            if (data.album?.images && data.album.images.length > 0) {
                // Spotify provides images in descending order of size
                // Look for the largest image that's not too square (prefer 4:3 ratio)
                const albumImages = data.album.images;
                
                // First try to find an image that's wider than tall (closer to 4:3)
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
                console.log(`[SpotifyAPI] Selected album art: ${bestImage.width}x${bestImage.height} (ratio: ${(bestImage.width / bestImage.height).toFixed(2)})`);
            }
            
            // Fallback to artist image if no album art
            if (!albumArtUrl && mainArtist?.images && mainArtist.images.length > 0) {
                // For artist images, prefer the largest available
                artistImageUrl = mainArtist.images[0].url;
                console.log(`[SpotifyAPI] Using artist image as fallback: ${mainArtist.images[0].width}x${mainArtist.images[0].height}`);
            }
            
            const trackDetails = {
                title: data.name,
                artist: data.artists.map(a => a.name).join(', '),
                // Prioritize album art over artist image for better 4:3 ratio
                artistImageUrl: artistImageUrl,
                albumArtUrl: albumArtUrl,
                duration: data.duration_ms,
                id: data.id,
                album: data.album?.name || null
            };
            console.log(`[SpotifyAPI] Successfully fetched track details for "${trackDetails.title}" with album art: ${albumArtUrl ? 'Yes' : 'No'}, artist image: ${artistImageUrl ? 'Yes' : 'No'}`);
            return trackDetails;
        }
    } catch (error) {
        console.error(`[SpotifyAPI] Network error fetching track details: ${error.message}`);
    }

    return null; // Return null if anything goes wrong
}
