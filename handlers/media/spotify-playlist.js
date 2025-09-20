// handlers/spotify-playlist-handler.js
import { getPlaylistTracks, getPlaylistInfo } from './spotify-playlists.js';
import { getOrCreateVoiceConnection, getOrCreateAudioSession } from '../common/audio-session.js';
import { unifiedYtdlpService } from '../../utils/processors/unified-ytdlp-service.js';
import { getExistingSession, hasValidSession } from '../../utils/core/audio-state.js';
import { AudioPlayerStatus } from '@discordjs/voice';
// REMOVED: playNextInQueue import - playback now handled by centralized queue manager
import { isGuildLocked, acquireGuildLock, releaseGuildLock } from '../../utils/core/processing-locks.js';
import { addToPendingQueue, transferPendingQueue } from '../../utils/core/pending-queue.js';
import { queueManager } from '../../utils/services/queue-manager.js';

export async function handleSpotifyPlaylist(djsClient, guildId, member, channelId, query, interactionDetails) {
    console.log(`[SpotifyPlaylist] Starting playlist processing for guild ${guildId}`);
    console.log(`[SpotifyPlaylist] Query: ${query}`);
    
    // FIXED: Check if another song is already being processed for this guild
    const lockAcquired = acquireGuildLock(guildId);
    if (!lockAcquired) {
        console.log(`[SpotifyPlaylist] Another song is being processed for guild ${guildId}, will add to queue after processing`);
    } else {
        console.log(`[SpotifyPlaylist] Acquired processing lock for guild ${guildId}`);
    }
    
    try {
        // Extract Spotify playlist ID
        const spotifyPlaylistRegex = /spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/;
        const playlistId = query.match(spotifyPlaylistRegex)[1];
        console.log(`[SpotifyPlaylist] Extracted playlist ID: ${playlistId}`);
        
        // Get playlist info and tracks from Spotify API
        const [tracks, playlistInfo] = await Promise.all([
            getPlaylistTracks(playlistId),
            getPlaylistInfo(playlistId)
        ]);
        
        console.log(`[SpotifyPlaylist] Fetched ${tracks?.length || 0} tracks from playlist`);
        console.log(`[SpotifyPlaylist] Playlist info:`, playlistInfo);

        if (!tracks || tracks.length === 0) {
            console.log(`[SpotifyPlaylist] No tracks found for playlist ${playlistId}`);
            return;
        }

        // Get voice connection
        const { connection, error: connError } = await getOrCreateVoiceConnection(djsClient, guildId, member);
        if (connError) {
            console.log(`[SpotifyPlaylist] Connection error: ${connError}`);
            return;
        }

        // Get or create audio session
        let session = getExistingSession(guildId);
        
        if (session && hasValidSession(guildId)) {
            console.log(`[SpotifyPlaylist] Using existing session for guild ${guildId}`);
            if (session.connection !== connection) {
                console.log(`[SpotifyPlaylist] Updating connection reference for existing session`);
                session.connection = connection;
                try {
                    connection.subscribe(session.player);
                } catch (error) {
                    console.error(`[SpotifyPlaylist] Error updating player subscription:`, error);
                }
            }
        } else {
            console.log(`[SpotifyPlaylist] Creating new session for guild ${guildId}`);
            session = await getOrCreateAudioSession(guildId, connection, channelId, djsClient, null);
        }
        
        // Ensure the channel ID is set for queue message creation
        session.lastPlayCommandChannelId = channelId;

        if (session.isStarting) {
            console.log(`[SpotifyPlaylist] Session is starting, returning early`);
            return;
        }

        const isPlaying = session.player.state.status !== AudioPlayerStatus.Idle || session.isStarting;
        console.log(`[SpotifyPlaylist] Is currently playing: ${isPlaying}`);

        // Get playlist title for display
        const playlistTitle = playlistInfo?.name || 'Spotify Playlist';

        // FIXED: Memory management for large playlists
        const maxPlaylistSize = 100; // Limit playlist size to prevent memory issues
        const limitedTracks = tracks.slice(0, maxPlaylistSize);
        
        if (tracks.length > maxPlaylistSize) {
            console.log(`[SpotifyPlaylist] Large playlist detected (${tracks.length} tracks), limiting to ${maxPlaylistSize} to prevent memory issues`);
        }

        // STREAMLINED: Convert Spotify tracks to minimal song objects
        const songObjects = limitedTracks
            .filter(track => track && track.title && track.artist)
            .map(track => ({
                title: `${track.title} - ${track.artist}`,
                query: `ytsearch1:${track.title} ${track.artist}`, // YouTube search query for unified service
                addedBy: member.user?.username || member.user?.global_name || 'Unknown User',
                thumbnailUrl: track.albumArtUrl || track.artistImageUrl || null,
                // Include duration data from Spotify API
                duration: track.duration ? Math.floor(track.duration / 1000) : null, // Convert ms to seconds
                spotifyId: track.id || null,
                album: track.album || null
                // REMOVED: spotifyData - this is heavy and not needed in queue
            }));

        // CRITICAL: Check duration limits for each song before adding to queue
        // This prevents long songs from being added to the queue in the first place
        console.log(`[SpotifyPlaylist] Checking duration limits for ${songObjects.length} songs`);
        
        try {
            const { getGuildSettings } = await import('../../utils/database/guildSettings.js');
            const { checkDurationLimit } = await import('../../utils/functions/duration-limits.js');
            const settings = await getGuildSettings(guildId);
            const maxDuration = settings.max_duration_seconds || 0;
            
            if (maxDuration > 0) {
                console.log(`[SpotifyPlaylist] Duration limit is set to ${maxDuration} seconds (${Math.floor(maxDuration / 60)}m ${maxDuration % 60}s)`);
                
                // Filter out songs that exceed the duration limit
                const validSongs = [];
                const rejectedSongs = [];
                
                for (const song of songObjects) {
                    // Use Spotify duration for initial check, but note that YouTube duration will be checked later
                    const spotifyDuration = song.duration;
                    
                    if (spotifyDuration && spotifyDuration > maxDuration) {
                        console.log(`[SpotifyPlaylist] ❌ Rejecting "${song.title}" - Spotify duration ${Math.floor(spotifyDuration / 60)}m ${spotifyDuration % 60}s exceeds limit`);
                        rejectedSongs.push(song);
                    } else {
                        validSongs.push(song);
                    }
                }
                
                if (rejectedSongs.length > 0) {
                    console.log(`[SpotifyPlaylist] Rejected ${rejectedSongs.length} songs due to duration limits`);
                    
                    // Send warning message to user about rejected songs
                    if (interactionDetails) {
                        try {
                            // Error messages are handled by the error system
                            console.log(`[SpotifyPlaylist] Warning: ${rejectedSongs.length} song(s) from the playlist were skipped because they exceed the ${Math.floor(maxDuration / 60)}m ${maxDuration % 60}s duration limit.`);
                        } catch (sendError) {
                            console.error('[SpotifyPlaylist] Failed to send duration limit warning:', sendError.message);
                        }
                    }
                }
                
                // Update songObjects to only include valid songs
                songObjects.length = 0;
                songObjects.push(...validSongs);
                
                console.log(`[SpotifyPlaylist] ✅ ${validSongs.length} songs passed duration limit check`);
            } else {
                console.log(`[SpotifyPlaylist] No duration limit set (maxDuration: ${maxDuration})`);
            }
        } catch (durationError) {
            console.error(`[SpotifyPlaylist] Duration limit check failed:`, durationError.message);
            // Continue without duration check if it fails, but log the error
        }

        console.log(`[SpotifyPlaylist] Created ${songObjects.length} song objects from ${limitedTracks.length} tracks (original: ${tracks.length})`);
        
        // FIXED: Clear large arrays from memory after processing
        tracks.length = 0; // Clear the original tracks array to free memory

        // Store playlist information in session
        session.currentPlaylist = {
            title: playlistTitle,
            source: query,
            totalTracks: songObjects.length,
            addedAt: new Date().toISOString(),
            owner: playlistInfo?.owner || 'Unknown',
            description: playlistInfo?.description || null
        };

        if (isPlaying) {
            console.log(`[SpotifyPlaylist] Adding ${songObjects.length} tracks to existing queue`);
            
            // Use centralized queue manager for consistent behavior
            const result = await queueManager.addSongsToQueue(guildId, songObjects, djsClient, session, {
                shouldPreload: true,
                preloadOnlyNext: true,
                emitQueueChanged: true
            });
            
            console.log(`[SpotifyPlaylist] Added ${result.addedCount} songs to existing queue. Queue length: ${result.totalQueueLength}`);
            
            // Clear any existing voice timeout since there's now music in the queue
            const { clearVoiceTimeout } = await import('../ui/menu-components.js');
            clearVoiceTimeout(guildId);
            
            // Store interaction details for potential clearing later
            session.lastQueueProcessingMessage = interactionDetails;
            
            // Update playback controls embed
            try {
                const { updatePlaybackControlsEmbed } = await import('../ui/menu-components.js');
                updatePlaybackControlsEmbed(guildId, djsClient, session).catch(error => {
                    console.error('[SpotifyPlaylistHandler] Error updating playback controls embed:', error);
                });
            } catch (error) {
                console.error('[SpotifyPlaylistHandler] Error updating playback controls embed:', error.message);
            }
        } else {
            console.log(`[SpotifyPlaylist] Adding ${songObjects.length} tracks to queue for playback`);
            session.lastQueueProcessingMessage = interactionDetails;
            
            // HANDLERS ONLY COLLECT DATA - NO PLAYBACK
            // Add all songs to queue using centralized manager
            const result = await queueManager.addPlaylistToQueue(guildId, songObjects, djsClient, session, {
                name: playlistTitle,
                source: query,
                owner: playlistInfo?.owner || 'Unknown',
                description: playlistInfo?.description || null
            });
            
            console.log(`[SpotifyPlaylist] Added playlist: ${result.inMemoryCount} in memory, ${result.databaseCount} in database`);
            console.log(`[SpotifyPlaylist] Playback started: ${result.startedPlayback ? 'Yes' : 'No'}`);
            
            // Clear any existing voice timeout since there's now music in the queue
            const { clearVoiceTimeout } = await import('../ui/menu-components.js');
            clearVoiceTimeout(guildId);
            
            // Update playback controls embed
            try {
                const { updatePlaybackControlsEmbed } = await import('../ui/menu-components.js');
                updatePlaybackControlsEmbed(guildId, djsClient, session).catch(error => {
                    console.error('[SpotifyPlaylistHandler] Error updating playback controls embed:', error);
                });
            } catch (error) {
                console.error('[SpotifyPlaylistHandler] Error updating playback controls embed:', error.message);
            }
        }

        console.log(`[SpotifyPlaylist] Final queue length: ${session.queue.length}`);
        
    } catch (error) {
        console.error('[SpotifyPlaylistHandler] Error:', error);
        
        // FIXED: Clean up resources on error to prevent memory leaks
        try {
            // Clean up any running processes
            const { cleanupService } = await import('../../utils/services/cleanup-service.js');
            cleanupService.cleanupGuildProcesses(guildId);
            console.log(`[SpotifyPlaylist] Cleaned up guild processes after error for guild ${guildId}`);
        } catch (cleanupError) {
            console.error(`[SpotifyPlaylist] Error cleaning up processes after error:`, cleanupError.message);
        }
        
        // FIXED: Release the processing lock on error
        if (lockAcquired) {
            releaseGuildLock(guildId);
            console.log(`[SpotifyPlaylist] Released processing lock after error for guild ${guildId}`);
        }
    } finally {
        // FIXED: Always release the processing lock
        if (lockAcquired) {
            releaseGuildLock(guildId);
            console.log(`[SpotifyPlaylist] Released processing lock for guild ${guildId}`);
        }
    }
}
