// handlers/youtube-playlist-handler.js
import { getOrCreateVoiceConnection, getOrCreateAudioSession } from '../common/audio-session.js';
import { unifiedYtdlpService } from '../../utils/processors/unified-ytdlp-service.js';
import { getExistingSession, hasValidSession } from '../../utils/core/audio-state.js';
import { AudioPlayerStatus } from '@discordjs/voice';
// REMOVED: playNextInQueue import - playback now handled by centralized queue manager

// FIXED: Import shared processing locks
import { isGuildLocked, acquireGuildLock, releaseGuildLock } from '../../utils/core/processing-locks.js';
import { addToPendingQueue, transferPendingQueue, getPendingQueue } from '../../utils/core/pending-queue.js';
import { queueManager } from '../../utils/services/queue-manager.js';
import { playerStateManager } from '../../utils/core/player-state-manager.js';

// Helper function to get YouTube thumbnail URL
function getYouTubeThumbnailUrl(videoId, quality = 'hqdefault') {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

// Helper function to run unified yt-dlp service with timeout for playlist info only
async function getPlaylistInfo(playlistUrl, timeoutMs = 15000) {
    return Promise.race([
        unifiedYtdlpService.getPlaylistInfo(playlistUrl),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('yt-dlp timeout')), timeoutMs)
        )
    ]);
}

// Helper function to get playlist tracks with timeout
async function getPlaylistTracks(playlistUrl, timeoutMs = 45000) {
    return Promise.race([
        unifiedYtdlpService.getPlaylistTracks(playlistUrl),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('yt-dlp timeout')), timeoutMs)
        )
    ]);
}

export async function handleYouTubePlaylist(djsClient, guildId, member, channelId, query, interactionDetails, displayPref) {
    console.log(`[YouTubePlaylist] Starting playlist processing for guild ${guildId}`);
    console.log(`[YouTubePlaylist] Query: ${query}`);
    
    // FIXED: Check if another song is already being processed for this guild
    const lockAcquired = acquireGuildLock(guildId);
    if (!lockAcquired) {
        console.log(`[YouTubePlaylist] Another song is being processed for guild ${guildId}, will add to queue after processing`);
    } else {
        console.log(`[YouTubePlaylist] Acquired processing lock for guild ${guildId}`);
    }
    
    try {
        // Get voice connection
        const { connection, error: connError } = await getOrCreateVoiceConnection(djsClient, guildId, member);
        if (connError) {
            console.error('[YouTubePlaylist] Connection error:', connError);
            return;
        }

        // Get or create audio session
        let session = getExistingSession(guildId);
        
        if (session && hasValidSession(guildId)) {
            console.log(`[YouTubePlaylist] Using existing session for guild ${guildId}`);
            if (session.connection !== connection) {
                console.log(`[YouTubePlaylist] Updating connection reference for existing session`);
                session.connection = connection;
                try {
                    connection.subscribe(session.player);
                } catch (error) {
                    console.error(`[YouTubePlaylist] Error updating player subscription:`, error);
                }
            }
        } else {
            console.log(`[YouTubePlaylist] Creating new session for guild ${guildId}`);
            session = await getOrCreateAudioSession(guildId, connection, channelId, djsClient, null);
        }
        
        // Ensure the channel ID is set for queue message creation
        session.lastPlayCommandChannelId = channelId;

        if (playerStateManager.isStarting(guildId)) {
            console.log('[YouTubePlaylist] Track is still loading, skipping request.');
            return;
        }
        
        // FIXED: If locked, just add to existing session queue and return
        if (!lockAcquired) {
            console.log(`[YouTubePlaylist] Another song is being processed for guild ${guildId}, adding playlist tracks to queue and exiting`);
            
            // We need to fetch playlist tracks first to add them to the pending queue
            let playlistTracks = [];
            try {
                const tracksOutput = await getPlaylistTracks(query, 45000);
                
                // The unified service now returns an array of track objects directly
                if (Array.isArray(tracksOutput)) {
                    playlistTracks = tracksOutput;
                } else {
                    // Fallback for string output (legacy format)
                    playlistTracks = tracksOutput.split('\n').filter(Boolean).map(line => {
                        const [title, url] = line.split('|||');
                        return { title: title?.trim(), url: url?.trim() };
                    });
                }
                
                console.log(`[YouTubePlaylist] Fetched ${playlistTracks.length} tracks for pending queue`);
            } catch (err) {
                console.error('[YouTubePlaylist] Failed to fetch playlist tracks for pending queue:', err.message);
                return; // Exit if we can't fetch tracks
            }
            
            // Create song objects for the playlist tracks
            const songObjects = playlistTracks
                .filter(track => track && track.title && track.url)
                .map(track => {
                    const videoIdMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                    const videoId = videoIdMatch ? videoIdMatch[1] : null;
                    const thumbnailUrl = videoId ? getYouTubeThumbnailUrl(videoId) : null;
                    
                    return {
                        title: track.title,
                        query: track.url,
                        addedBy: member.user?.username || member.user?.global_name || 'Unknown User',
                        thumbnailUrl: thumbnailUrl,
                        youtubeData: {
                            videoId: videoId,
                            url: track.url
                        }
                    };
                });
            
            // Add to shared pending queue
            songObjects.forEach(song => addToPendingQueue(guildId, song));
            
            // Try to find existing session to add to queue immediately
            if (session) {
                // Session exists, transfer all pending songs to the real queue
                const transferredCount = transferPendingQueue(guildId, session, djsClient);
                console.log(`[YouTubePlaylist] Transferred ${transferredCount} pending songs to existing queue. Queue length: ${session.queue.length}`);
                
                // Emit queueChanged after transferring pending songs to trigger preload
                if (transferredCount > 0) {
                    console.log(`[YouTubePlaylist] Emitting queueChanged after transferring ${transferredCount} pending songs in early return path`);
                    djsClient.emit('queueChanged', guildId, session);
                }
                
                // Voice timeout is now managed by event-driven system in bot.js
            } else {
                console.log(`[YouTubePlaylist] No session exists yet, ${songObjects.length} tracks will be added when session is created`);
            }
            
            return; // EXIT EARLY - don't do any more processing
        }

        const isPlaying = session.player.state.status !== AudioPlayerStatus.Idle || playerStateManager.isStarting(guildId);
        console.log(`[YouTubePlaylist] Is currently playing: ${isPlaying}`);

        // Extract playlist ID from URL
        const playlistMatch = query.match(/[?&]list=([^&]+)/);
        if (!playlistMatch) {
            throw new Error('No playlist ID found in URL');
        }
        
        const playlistId = playlistMatch[1];
        console.log(`[YouTubePlaylist] Extracted playlist ID: ${playlistId}`);
        
        // Get playlist info quickly (just title)
        let playlistTitle = 'YouTube Playlist';
        try {
            console.log('[YouTubePlaylist] Fetching playlist title...');
            const playlistInfo = await getPlaylistInfo(query, 15000);
            
            if (playlistInfo && playlistInfo.trim()) {
                playlistTitle = playlistInfo.trim();
                console.log(`[YouTubePlaylist] Got playlist title: ${playlistTitle}`);
            }
        } catch (err) {
            console.log('[YouTubePlaylist] Could not get playlist title, using default:', err.message);
        }

        // Get playlist tracks with titles and URLs
        console.log('[YouTubePlaylist] Fetching playlist tracks...');
        let playlistTracks = [];
        try {
            const tracksOutput = await getPlaylistTracks(query, 45000);
            
            // The unified service now returns an array of track objects directly
            if (Array.isArray(tracksOutput)) {
                playlistTracks = tracksOutput;
            } else {
                // Fallback for string output (legacy format)
                playlistTracks = tracksOutput.split('\n').filter(Boolean).map(line => {
                    const [title, url] = line.split('|||');
                    return { title: title?.trim(), url: url?.trim() };
                });
            }
            
            console.log(`[YouTubePlaylist] Successfully fetched ${playlistTracks.length} tracks`);
        } catch (err) {
            console.error('[YouTubePlaylist] Failed to fetch playlist tracks:', err.message);
            throw new Error(`Failed to fetch playlist tracks: ${err.message}`);
        }

        if (!playlistTracks || playlistTracks.length === 0) {
            throw new Error('No videos found in playlist');
        }

        // Convert tracks to song objects
        const songObjects = playlistTracks
            .filter(track => track && track.title && track.url)
            .map(track => {
                // Extract video ID from YouTube URL for thumbnail
                const videoIdMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                const videoId = videoIdMatch ? videoIdMatch[1] : null;
                const thumbnailUrl = videoId ? getYouTubeThumbnailUrl(videoId) : null;
                
                return {
                    title: track.title,
                    query: track.url, // Use the YouTube URL as the query for unified service
                    addedBy: member.user?.username || member.user?.global_name || 'Unknown User',
                    thumbnailUrl: thumbnailUrl,
                    // Store YouTube-specific metadata
                    youtubeData: {
                        videoId: videoId,
                        url: track.url
                    }
                };
            });

        console.log(`[YouTubePlaylist] Created ${songObjects.length} song objects from ${playlistTracks.length} tracks`);

        // Store playlist information in session
        session.currentPlaylist = {
            title: playlistTitle,
            source: query,
            totalTracks: songObjects.length,
            addedAt: new Date().toISOString()
        };

        if (isPlaying) {
            console.log(`[YouTubePlaylist] Adding ${songObjects.length} tracks to existing queue`);
            
            // CENTRALIZED QUEUE MANAGEMENT: Use queue manager for consistent behavior
            console.log(`[YouTubePlaylist] Adding ${songObjects.length} songs to existing queue using centralized queue manager`);
            
            try {
                const result = await queueManager.addSongsToQueue(guildId, songObjects, djsClient, session, {
                    shouldPreload: true,
                    preloadOnlyNext: true,
                    emitQueueChanged: true
                });
                
                console.log(`[YouTubePlaylist] ✅ Centralized queue management completed:`, {
                    addedCount: result.addedCount,
                    totalQueueLength: result.totalQueueLength,
                    preloadedCount: result.preloadedCount
                });
            } catch (error) {
                console.error(`[YouTubePlaylist] ❌ Centralized queue management failed:`, error.message);
                throw error; // Let the error propagate instead of using fallback
            }
            
            // Clear any existing voice timeout since there's now music in the queue
            const { clearVoiceTimeout } = await import('../ui/menu-components.js');
            clearVoiceTimeout(guildId);
            
            // Store interaction details for potential clearing later
            session.lastQueueProcessingMessage = interactionDetails;
            
            // Update playback controls embed
            try {
                const { updatePlaybackControlsEmbed } = await import('../ui/menu-components.js');
                updatePlaybackControlsEmbed(guildId, djsClient, session).catch(error => {
                    console.error('[YouTubePlaylist] Error updating playback controls embed:', error);
                });
            } catch (error) {
                console.error('[YouTubePlaylist] Error updating playback controls embed:', error.message);
            }
        } else {
            console.log(`[YouTubePlaylist] Starting playback with ${songObjects.length} tracks`);
            session.lastQueueProcessingMessage = interactionDetails;
            
            // CENTRALIZED QUEUE MANAGEMENT: Use queue manager for consistent behavior
            console.log(`[YouTubePlaylist] Starting playback with ${songObjects.length} tracks using centralized queue manager`);
            
            try {
                const result = await queueManager.addPlaylistToQueue(guildId, songObjects, djsClient, session, {
                    name: playlistTitle || 'YouTube Playlist',
                    source: 'YouTube',
                    totalTracks: songObjects.length,
                    owner: 'Unknown',
                    description: null
                });
                
                console.log(`[YouTubePlaylist] ✅ Centralized playlist management completed:`, {
                    addedCount: result.addedCount,
                    inMemoryCount: result.inMemoryCount,
                    databaseCount: result.databaseCount
                });
            } catch (error) {
                console.error(`[YouTubePlaylist] ❌ Centralized playlist management failed:`, error.message);
                throw error; // Let the error propagate instead of using fallback
            }
            
            // Set proper loading state flags to show loading screen
            playerStateManager.setLoading(guildId, true);
            session.currentlyProcessingSong = songObjects[0]; // Set first track as currently processing
            
            // UNIFIED LOADING: Complete loading with first song metadata
            try {
                const { completeUnifiedLoading } = await import('../../utils/services/unified-loading-service.js');
                const firstSong = songObjects[0];
                const songMetadata = {
                    title: firstSong.title,
                    artist: firstSong.artist || 'Unknown Artist',
                    duration: firstSong.duration || 'Unknown Duration',
                    thumbnail: firstSong.thumbnailUrl
                };
                await completeUnifiedLoading(guildId, songMetadata);
            } catch (loadingError) {
                console.error('[YouTubePlaylist] Failed to complete unified loading:', loadingError.message);
            }
            
            // Start playback with first track - handled by centralized queue manager
            console.log(`[YouTubePlaylist] Playback will be handled by centralized queue manager`);
            
            // Update playback controls embed
            try {
                const { updatePlaybackControlsEmbed } = await import('../ui/menu-components.js');
                updatePlaybackControlsEmbed(guildId, djsClient, session).catch(error => {
                    console.error('[YouTubePlaylist] Error updating playback controls embed:', error);
                });
            } catch (error) {
                console.error('[YouTubePlaylist] Error updating playback controls embed:', error.message);
            }
            
            // FIXED: Transfer any pending songs to the session queue now that session exists
            const transferredCount = transferPendingQueue(guildId, session, djsClient);
            
            // Emit queueChanged after pending queue transfer to trigger preload
            if (transferredCount > 0) {
                console.log(`[YouTubePlaylist] Emitting queueChanged after transferring ${transferredCount} pending songs`);
                djsClient.emit('queueChanged', guildId, session);
            }
            
            // FIXED: Clear processing lock after playlist starts playing successfully
            if (lockAcquired) {
                releaseGuildLock(guildId);
                console.log(`[YouTubePlaylist] Released processing lock for guild ${guildId} - playlist is now playing`);
            }
        }

        console.log(`[YouTubePlaylist] Successfully processed playlist: ${playlistTitle} with ${songObjects.length} tracks`);
        
    } catch (error) {
        console.error(`[YouTubePlaylist] Error:`, error);
        
        // FIXED: Clear processing lock on error
        if (lockAcquired) {
            releaseGuildLock(guildId);
            console.log(`[YouTubePlaylist] Released processing lock for guild ${guildId} due to error`);
        }
    } finally {
        // CRITICAL FIX: Always release the lock, even on error
        if (lockAcquired) {
            releaseGuildLock(guildId);
            console.log(`[YouTubePlaylist] Released processing lock for guild ${guildId} in finally block`);
        }
    }
}
