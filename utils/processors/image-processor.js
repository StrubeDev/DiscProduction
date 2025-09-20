/**
 * Image Processor
 * Handles image logic for different sources (Spotify, YouTube, etc.)
 */

export class ImageProcessor {
    constructor() {
        console.log('[ImageProcessor] Service loaded successfully');
    }

    /**
     * Get the appropriate image for display
     * Simply determines what image to show, doesn't modify the song object
     * 
     * @param {Object} song - Song object
     * @returns {string|null} Image URL for display
     */
    getDisplayImage(song) {
        if (!song) return null;

        console.log(`[ImageProcessor] Getting display image for: "${song.title}"`);
        console.log(`[ImageProcessor] Song source: ${song.source || 'unknown'}, isSpotify: ${song.isSpotify}`);
        console.log(`[ImageProcessor] Available images: thumbnail=${song.thumbnail}, imageUrl=${song.imageUrl}`);

        const isSpotifyTrack = song.source === 'spotify' || song.isSpotify || song.spotifyData;
        
        if (isSpotifyTrack) {
            // For Spotify tracks, prioritize the original image (Spotify album art)
            const displayImage = song.thumbnail || song.imageUrl;
            console.log(`[ImageProcessor] ✅ Spotify track - using: ${displayImage}`);
            return displayImage;
        } else {
            // For YouTube tracks, use imageUrl
            const displayImage = song.imageUrl || song.thumbnail;
            console.log(`[ImageProcessor] ✅ YouTube track - using: ${displayImage}`);
            return displayImage;
        }
    }

}

export const imageProcessor = new ImageProcessor();
