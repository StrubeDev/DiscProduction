// handlers/media/index.js
/**
 * Media processing handlers exports
 * Handles track and playlist processing for different platforms
 */

export { handleSpotifyTrack } from '../core/unified-media-handler.js';
export { handleSpotifyPlaylist } from './spotify-playlist.js';
export { handleYouTubeTrack } from '../core/unified-media-handler.js';
export { handleYouTubePlaylist } from './youtube-playlist.js';

