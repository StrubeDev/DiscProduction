/**
 * Queue management page and related functions
 */

import { getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import { getGuildQueue } from '../../utils/database/guildQueues.js';

// Import required services and managers
let guildAudioSessions, playerStateManager;

// Export the guild queue display preference map
export const guildQueueDisplayPreference = new Map();

// Lazy load to avoid circular dependencies
async function getImports() {
    if (!guildAudioSessions) {
        try {
            console.log('[QueueMsg] Loading core modules...');
            const [audioState, playerState] = await Promise.all([
                import('../../utils/core/audio-state.js'),
                import('../../utils/core/player-state-manager.js')
            ]);
            
            console.log('[QueueMsg] Core modules loaded:', {
                hasGuildAudioSessions: !!audioState.guildAudioSessions,
                hasPlayerStateManager: !!playerState.playerStateManager,
                playerStateManagerType: typeof playerState.playerStateManager
            });
            
            guildAudioSessions = audioState.guildAudioSessions;
            playerStateManager = playerState.playerStateManager;
            // guildQueueDisplayPreference is already declared as a Map in this module
        } catch (error) {
            console.error('[QueueMsg] Error loading core modules:', error);
            throw error;
        }
    }
    return { guildAudioSessions, playerStateManager };
}

export async function createQueueMessageData(guildId) {
    let guildAudioSessions, playerStateManager;
    
    try {
        const imports = await getImports();
        guildAudioSessions = imports.guildAudioSessions;
        playerStateManager = imports.playerStateManager;
    } catch (error) {
        console.error('[QueueMsg] Failed to load imports:', error);
        return {
            embeds: [{
                title: 'Queue & Playback Status',
                description: 'Error: Unable to load required modules.',
                color: 0xFF0000
            }],
            components: [{
                type: MessageComponentTypes.ACTION_ROW,
                components: [{
                    type: MessageComponentTypes.BUTTON,
                    custom_id: 'menu_nav_main',
                    label: 'Back to Main Menu',
                    style: ButtonStyleTypes.SECONDARY,
                }]
            }]
        };
    }
    
    // Safety check for playerStateManager
    if (!playerStateManager || typeof playerStateManager.getNowPlaying !== 'function') {
        console.error('[QueueMsg] playerStateManager is undefined or invalid, cannot create queue message data');
        console.error('[QueueMsg] playerStateManager type:', typeof playerStateManager);
        console.error('[QueueMsg] playerStateManager value:', playerStateManager);
        return {
            embeds: [{
                title: 'Queue & Playback Status',
                description: 'Error: Player state manager is not available.',
                color: 0xFF0000
            }],
            components: [{
                type: MessageComponentTypes.ACTION_ROW,
                components: [{
                    type: MessageComponentTypes.BUTTON,
                    custom_id: 'menu_nav_main',
                    label: 'Back to Main Menu',
                    style: ButtonStyleTypes.SECONDARY,
                }]
            }]
        };
    }
    
    let session = guildAudioSessions.get(guildId);
    if (!session) {
        const savedQueueData = await getGuildQueue(guildId);
        if (savedQueueData) {
            // SAFETY CHECK: Filter out any songs with Spotify URLs from the restored queue
            const filteredQueue = Array.isArray(savedQueueData.queue) ? savedQueueData.queue.filter(song => {
                if (song.query && (song.query.includes('open.spotify.com/track/') || song.query.startsWith('spotify:track:'))) {
                    console.log(`[QueueMsg] SAFETY CHECK: Filtering out Spotify URL from restored queue: "${song.query}"`);
                    return false;
                }
                return true;
            }) : [];
            
            // HISTORY REMOVED: History is now database-only to save memory
            // No need to filter or load history into memory
            
            // SAFETY CHECK: Also check if nowPlaying has a Spotify URL
            let nowPlaying = savedQueueData.nowPlaying;
            if (nowPlaying && nowPlaying.query && (nowPlaying.query.includes('open.spotify.com/track/') || nowPlaying.query.startsWith('spotify:track:'))) {
                console.log(`[QueueMsg] SAFETY CHECK: Filtering out Spotify URL from nowPlaying: "${nowPlaying.query}"`);
                nowPlaying = null;
            }
            
            session = {
                nowPlaying: nowPlaying,
                queue: filteredQueue,
                // HISTORY REMOVED: History is now database-only to save memory
                lazyLoadInfo: savedQueueData.lazyLoadInfo || null,
                currentPlaylist: savedQueueData.currentPlaylist || null,
                volume: savedQueueData.volume || 100 // Use saved volume or default to 100%
            };
            
            // FIXED: Log what we loaded to help debug
            console.log(`[QueueMsg] Loaded queue from database for guild ${guildId}:`, {
                queueLength: session.queue.length,
                hasNowPlaying: playerStateManager ? !!playerStateManager.getNowPlaying(guildId) : false,
                hasHistory: false, // History is now database-only
                hasLazyLoadInfo: !!session.lazyLoadInfo,
                filteredOutCount: (savedQueueData.queue?.length || 0) - filteredQueue.length + (savedQueueData.history?.length || 0) - 0 // No history in memory
            });
        }
    }

    const connection = getVoiceConnection(guildId);
    const isBotConnected = connection && connection.state.status !== VoiceConnectionStatus.Destroyed && connection.state.status !== VoiceConnectionStatus.Disconnected;

    // Create embed as plain object like working examples
    let embedData = {
        title: 'Queue & Playback Status',
        color: 0x506098
    };

    console.log(`[QueueMsg] Creating embed with title: "${embedData.title}" for guild ${guildId}`);

    if (!session || (!session.nowPlaying && (!session.queue || session.queue.length === 0))) {
        embedData.description = "The queue is empty! Use `/play` to add a song.";
    } else {
        const nowPlaying = session.nowPlaying;
        if (nowPlaying) {
            embedData.fields = [];
            embedData.fields.push({ name: '▶ Now Playing', value: `[${nowPlaying.title}](${nowPlaying.youtubeUrl || 'https://www.youtube.com'})` });

            // Add thumbnail if available
            if (nowPlaying.thumbnailUrl) {
                embedData.thumbnail = { url: nowPlaying.thumbnailUrl };
            }
        } else if (isBotConnected) {
            embedData.description = 'Nothing is currently playing, but the bot is connected.';
        } else {
            embedData.description = 'Bot is not connected. Nothing playing.';
        }

        // Show queue information
        const totalQueueCount = session.lazyLoadInfo?.totalCount || session.queue?.length || 0;
        
        if (totalQueueCount > 0) {
            if (!embedData.fields) embedData.fields = [];
            
            if (session.queue && session.queue.length > 0) {
                // Show in-memory queue (up to 10 songs)
                const queueString = session.queue
                    .slice(0, 10)
                    .map((song, index) => `${index + 1}. ${song.title}`)
                    .join('\n');
                embedData.fields.push({ name: '⬆ Up Next', value: queueString.substring(0, 1020) });
                
                // Show total count if there are more songs
                if (totalQueueCount > 10) {
                    embedData.footer = { text: `...and ${totalQueueCount - 10} more songs in queue.` };
                } else if (totalQueueCount > session.queue.length) {
                    embedData.footer = { text: `...and ${totalQueueCount - session.queue.length} more songs loading from database.` };
                }
            } else {
                // No songs in memory but songs in database
                embedData.fields.push({ name: '⬆ Up Next', value: `${totalQueueCount} songs loading from database...` });
            }
        } else if (isBotConnected && session.nowPlaying) {
            if (!embedData.fields) embedData.fields = [];
            embedData.fields.push({ name: '⬆ Up Next', value: 'The queue is empty.' });
        }

        // HISTORY: Fetch from database instead of memory
        try {
            const savedData = await getGuildQueue(guildId);
            if (savedData && savedData.history && savedData.history.length > 0) {
                if (!embedData.fields) embedData.fields = [];
                const historyString = savedData.history
                    .slice(0, 5)
                    .map((song, index) => `${index + 1}. ${song.title}`)
                    .join('\n');
                embedData.fields.push({ name: ' Recently Played', value: historyString.substring(0, 1020) });
            }
        } catch (error) {
            console.error(`[QueueMsg] Error fetching history from database:`, error.message);
        }
        if (!isBotConnected && session && session.nowPlaying) {
            embedData.description = `Bot was disconnected. Last playing: ${session.nowPlaying.title}`;
        }
    }

    // Only add the Back to Main Menu button
    const components = [
        {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
                {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: 'menu_nav_main',
                    label: 'Back to Main Menu',
                    style: ButtonStyleTypes.SECONDARY,
                },
            ],
        },
    ];

    // Return the embed data directly
    console.log(`[QueueMsg] Created embed with title: "${embedData.title}" for guild ${guildId}`);

    return {
        embeds: [embedData],
        components: components,
        content: ''
    };
}

export async function getQueueHistoryPageData(guildId, djsClient) {
    const messageData = await createQueueMessageData(guildId);
    messageData.components = [
        {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
                {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: 'menu_nav_main',
                    label: 'Back to Main Menu',
                    style: ButtonStyleTypes.SECONDARY,
                },
            ],
        },
    ];
    return messageData;
}

export async function updateQueuePanelIfDisplayed(guildId, djsClient, session) {
    try {
        const { getPanelInfo } = await import('../../utils/database/panels.js');
        const panelInfo = await getPanelInfo(guildId);

        if (panelInfo && panelInfo.message_id && panelInfo.channel_id) {
            const channel = await djsClient.channels.fetch(panelInfo.channel_id);
            if (channel && channel.isTextBased()) {
                try {
                    const message = await channel.messages.fetch(panelInfo.message_id);
                    
                    // Check if this message is currently showing the queue panel
                    if (message.embeds.length > 0 &&
                        message.embeds[0].title === 'Queue & Playback Status') {

                        console.log(`[QueuePanel] Queue panel is currently displayed for guild ${guildId}, updating automatically...`);
                        
                        const updatedPageData = await createQueueMessageData(guildId);
                        await message.edit(updatedPageData);
                        console.log(`[QueuePanel] Successfully updated queue panel for guild ${guildId} (display pref: ${guildQueueDisplayPreference.get(guildId) || 'chat'})`);
                    }
                } catch (error) {
                    console.warn(`[QueuePanel] Error updating queue panel for guild ${guildId}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.warn(`[QueuePanel] Error checking queue panel for guild ${guildId}:`, error.message);
    }
}

export async function isQueuePanelDisplayed(guildId) {
    try {
        const { getPanelInfo } = await import('../../utils/database/panels.js');
        const panelInfo = await getPanelInfo(guildId);

        if (panelInfo && panelInfo.message_id && panelInfo.channel_id) {
            return true;
        }
        return false;
    } catch (error) {
        console.warn(`[QueuePanel] Error checking if queue panel is displayed for guild ${guildId}:`, error.message);
        return false;
    }
}
