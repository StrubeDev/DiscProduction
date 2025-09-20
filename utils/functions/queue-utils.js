// utils/functions/queue-utils.js
/**
 * Queue management and validation utilities
 * Handles queue-related helper functions
 */

/**
 * Checks if a song is a duplicate in the queue
 * @param {Object} newSong - The song to check
 * @param {Array} existingQueue - The existing queue
 * @returns {boolean} - True if duplicate found
 */
export function isDuplicateSong(newSong, existingQueue) {
  return existingQueue.some(song => 
    song.query === newSong.query || 
    song.title === newSong.title ||
    (song.youtubeUrl && newSong.youtubeUrl && song.youtubeUrl === newSong.youtubeUrl)
  );
}

/**
 * Gets queue position for a song
 * @param {string} songTitle - The song title to find
 * @param {Array} queue - The queue to search
 * @returns {number} - Position in queue (0-based, -1 if not found)
 */
export function getQueuePosition(songTitle, queue) {
  return queue.findIndex(song => song.title === songTitle);
}

/**
 * Calculates estimated time until song plays
 * @param {number} position - Position in queue (0-based)
 * @param {number} averageSongLength - Average song length in seconds
 * @returns {number} - Estimated wait time in seconds
 */
export function calculateWaitTime(position, averageSongLength = 180) {
  return position * averageSongLength;
}

/**
 * Formats queue position for display
 * @param {number} position - Position in queue (0-based)
 * @returns {string} - Formatted position string
 */
export function formatQueuePosition(position) {
  if (position === -1) return 'Not in queue';
  if (position === 0) return 'Playing now';
  if (position === 1) return 'Next up';
  return `Position ${position + 1}`;
}

/**
 * Gets queue statistics
 * @param {Array} queue - The queue to analyze
 * @returns {Object} - Queue statistics
 */
export function getQueueStats(queue) {
  const totalSongs = queue.length;
  const totalDuration = queue.reduce((sum, song) => sum + (song.duration || 0), 0);
  const averageDuration = totalSongs > 0 ? totalDuration / totalSongs : 0;
  
  return {
    totalSongs,
    totalDuration,
    averageDuration,
    estimatedTotalTime: totalDuration
  };
}

