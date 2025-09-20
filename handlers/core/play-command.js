/* eslint-disable no-unused-vars */
// play-command-handler.js - FIXED VERSION

import { InteractionResponseType } from 'discord-interactions';
import { guildQueueDisplayPreference } from '../../utils/queue/display-preferences.js';
import { updatePersistentQueueMessage } from '../../utils/helpers/message-helpers.js';
import { saveGuildQueue } from '../../utils/database/guildQueues.js';
// REMOVED: ytDlpWrap and playSongResource imports - now using unified ytdlp service

// Import the specialized handlers
import { handleSpotifyTrack } from '../core/unified-media-handler.js';
import { handleSpotifyPlaylist } from '../media/spotify-playlist.js';
import { handleYouTubeTrack } from '../core/unified-media-handler.js';
import { handleYouTubePlaylist } from '../media/youtube-playlist.js';

// Regexes to determine the query type
const spotifyPlaylistRegex = /spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/;
const spotifyTrackRegex = /(?:spotify\.com\/track\/([a-zA-Z0-9]+)|spotify:track:([a-zA-Z0-9]+))/;
// FIXED: More specific YouTube playlist regex that only matches actual playlist URLs
// This prevents regular video URLs from being treated as playlists
const youtubePlaylistRegex = /(?:[\w-]+\.)?youtube\.com\/(?:playlist\?list=|watch\?.*?&list=)([a-zA-Z0-9_-]+)(?:&.*)?$/;

// Helper functions for YouTube URL processing
function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function getYouTubeThumbnailUrl(videoId, quality = 'maxresdefault') {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

// Helper function to create a clean, serializable session object for the database
export function getSerializableSession(session) {
    if (!session) {
        return { nowPlaying: null, queue: [], history: [], lazyLoadInfo: null };
    }
    const ensureSimpleType = (value, fallback = null) => {
        if (value === null || typeof value === 'undefined') return fallback;
        if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
        return String(value);
    };
    const serializableNowPlaying = session.nowPlaying ? {
        title: ensureSimpleType(session.nowPlaying.title, 'Unknown Title'),
        query: ensureSimpleType(session.nowPlaying.query, 'Unknown Query'),
        addedBy: ensureSimpleType(session.nowPlaying.addedBy, 'Unknown User'),
        actualYouTubeTitle: ensureSimpleType(session.nowPlaying.actualYouTubeTitle, session.nowPlaying.title || 'Unknown YouTube Title'),
        youtubeUrl: ensureSimpleType(session.nowPlaying.youtubeUrl, ''),
        thumbnailUrl: ensureSimpleType(session.nowPlaying.thumbnailUrl, null) // Add thumbnail URL
    } : null;
    const serializableQueue = Array.isArray(session.queue) ? session.queue.map(item => ({
        title: ensureSimpleType(item.title, 'Unknown Title'),
        query: ensureSimpleType(item.query, 'Unknown Query'),
        addedBy: ensureSimpleType(item.addedBy, 'Unknown User'),
        // FIXED: Preserve ALL important metadata for queue progression
        thumbnailUrl: ensureSimpleType(item.thumbnailUrl, null),
        originalSpotifyUrl: ensureSimpleType(item.originalSpotifyUrl, null),
        // NEW: Preserve stream details if they exist (but don't include the actual streams)
        hasStreamDetails: !!item.streamDetails,
        streamDetailsKeys: item.streamDetails ? Object.keys(item.streamDetails).filter(key => 
            key !== 'audioStream' && key !== 'process' // Don't save actual streams/processes
        ) : []
    })) : [];
    const serializableHistory = Array.isArray(session.history) ? session.history.map(item => ({
        title: ensureSimpleType(item.title, 'Unknown Title'),
        playedAt: item.playedAt instanceof Date ? item.playedAt.toISOString() : ensureSimpleType(item.title, new Date().toISOString())
    })) : [];
    const serializableLazyLoadInfo = session.lazyLoadInfo ? {
        playlistUrls: session.lazyLoadInfo.playlistUrls,
        currentTrackIndex: session.lazyLoadInfo.currentTrackIndex,
        requester: session.lazyLoadInfo.requester,
        isSpotify: session.lazyLoadInfo.isSpotify
    } : null;
    return {
        nowPlaying: serializableNowPlaying,
        queue: serializableQueue,
        history: serializableHistory,
        lazyLoadInfo: serializableLazyLoadInfo
    };
}

// --- REMOVED: routePlayQuery moved to query-router.js ---

// --- FIXED handlePlayCommand ---
export async function handlePlayCommand(req, res, djsClient) {
    // Extract interaction data
    const interactionId = req.body.id;
    const interactionToken = req.body.token;
    const applicationId = req.body.application_id;
    const guildId = req.body.guild_id;
    const member = req.body.member;
    const channelId = req.body.channel_id;

    console.log('[PlayCmd] Received command with details:', {
        interactionId,
        tokenPrefix: interactionToken?.substring(0, 10),
        applicationId,
        guildId
    });

    // Validate required fields
    if (!interactionToken || !applicationId) {
        console.error('[PlayCmd] Missing required interaction details');
        return;
    }

    // Extract options and build query
    let query;
    try {
        const options = req.body.data.options || [];
        
        // Check for query option (legacy)
        const queryOption = options.find(opt => opt.name === 'query');
        if (queryOption && queryOption.value && queryOption.value.trim().length > 0) {
            query = queryOption.value.trim();
            console.log('[PlayCmd] Using query option:', query);
        } else {
            // Check for song + artist options
            const songOption = options.find(opt => opt.name === 'song');
            const artistOption = options.find(opt => opt.name === 'artist');
            
            if (songOption && songOption.value && songOption.value.trim().length > 0) {
                const songName = songOption.value.trim();
                const artistName = artistOption ? artistOption.value.trim() : '';
                
                if (artistName && artistName.length > 0) {
                    // Use the same logic as the modal for combining song + artist
                    query = `"${songName}" "${artistName}"`;
                    console.log('[PlayCmd] Using song + artist options:', query);
                } else {
                    query = songName;
                    console.log('[PlayCmd] Using song only option:', query);
                }
            } else {
                console.error('[PlayCmd] No valid query, song, or song+artist provided');
                res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ Please provide either a query (song name/URL) or song name + artist name.',
                        flags: 64
                    },
                });
                return;
            }
        }
    } catch (error) {
        console.error('[PlayCmd] Error extracting options:', error);
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error processing command options.',
                flags: 64
            },
        });
        return;
    }

    // Check if a panel is active for this guild
    let isPanelActive = false;
    try {
        const { getPanelInfo } = await import('../utils/database/panels.js');
        const existingPanel = await getPanelInfo(guildId);
        isPanelActive = !!(existingPanel && existingPanel.messageId && existingPanel.channelId);
        console.log(`[PlayCmd] Panel active for guild ${guildId}: ${isPanelActive}`);
    } catch (error) {
        console.error('[PlayCmd] Error checking panel status:', error);
        isPanelActive = false;
    }

    // ADD EPHEMERAL FEEDBACK MESSAGE
    const feedbackMessage = '🎵 Processing your request...';
    res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: feedbackMessage,
            flags: 64 // Make it ephemeral
        },
    });

    // Create interaction details object (removed interactionId requirement)
    const interactionDetails = {
        applicationId: applicationId,
        interactionToken: interactionToken
    };

    try {
        // STEP 1: Voice timeout is now managed by event-driven system in bot.js
        
        // STEP 2: Make the play command execute immediately without waiting for UI updates
        // This ensures audio starts playing right away while UI updates happen in the background
        const { routePlayQuery } = await import('./query-router.js');
        routePlayQuery(djsClient, guildId, member, channelId, query, interactionDetails).catch(error => {
            console.error('[PlayCmd] Error in routePlayQuery:', error);
        });
    } catch (error) {
        console.error('[PlayCmd] Error in routePlayQuery:', error);
    }
}


// REMOVED: Deprecated playNextInQueue function - now using player system