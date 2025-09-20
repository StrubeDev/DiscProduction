// handlers/core/index.js
/**
 * Core system handlers exports
 * Essential handlers for playback, routing, and command processing
 */

export { Player } from './player.js';
export { routePlayQuery, getSerializableSession } from '../../routers/query-router.js';
export { handlePlayCommand } from './play-command.js';
export { player } from './player.js';
