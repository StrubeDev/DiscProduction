// C:\Users\korby\Documents\Dev\Discord\discord-example-app\bot.js

import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config'; // Make sure you have dotenv installed (npm install dotenv)
// Cleanup systems consolidated into streamlined cleanup

// Initialize the Discord.js Client with basic settings
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,         // Required for basic guild information
    GatewayIntentBits.GuildVoiceStates, // Essential for knowing user voice states and joining VCs
    GatewayIntentBits.GuildMessages,  // If your bot will also read message content (optional for menus)
    // Add any other intents your bot might need
  ]
});

// Define your slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or YouTube URL (use this OR song + artist)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('song')
        .setDescription('Song name (use with artist option)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('artist')
        .setDescription('Artist name (use with song option)')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('components')
    .setDescription('Show bot components and controls'),

  // MODIFIED: Add skip command definition
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips the current song'),

  // MODIFIED: Example for a stop command definition (if you plan to add one)
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops all playback, clears the queue, and disconnects.'),
  new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Analyze memory usage and detect potential leaks'),
  new SlashCommandBuilder()
    .setName('maps')
    .setDescription('Check Map sizes and memory leaks'),
      new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffles the current song queue.'),
      new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause all playback, clears the queue, and disconnects.'),
      new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resumes the paused music.'),

  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Completely resets the bot state for this guild (admin only).'),

].map(command => command.toJSON());

// Function to register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  
  try {
    console.log('Started refreshing application (/) commands.');

    // ALWAYS use guild-specific commands for production bots
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log('Successfully reloaded application (/) commands for guild.');
    } else {
      // Only use global commands for development/testing
      console.warn('WARNING: No GUILD_ID set, using global commands (not recommended for production)');
      await rest.put(
        Routes.applicationCommands(process.env.APP_ID),
        { body: commands },
      );
      console.log('Successfully reloaded application (/) commands globally.');
    }
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

// Event handler for when the bot is ready
client.on('ready', async () => {
  console.log(`Discord.js client logged in as ${client.user.tag}!`);
  
  // Set up audio player event listeners for automatic embed updates
  setupAudioPlayerListeners(client);
  // Initialize embed update service for state-driven UI
  try {
    const { EmbedUpdateService } = await import('./services/embed-update-service.js');
    await EmbedUpdateService.initialize();
    console.log('[Startup] EmbedUpdateService initialized');
  } catch (e) {
    console.warn('[Startup] Failed to initialize EmbedUpdateService:', e.message);
  }
  
  // All cleanup systems consolidated into streamlined cleanup
  console.log('Streamlined cleanup system active - no separate timers needed');
  
  // Register commands on bot start
  await registerCommands();
  
  
  // Instead, just log that the bot is ready
  console.log('Bot is ready and listening for interactions.');

});

// REMOVED: startMemoryMonitoring - functionality consolidated into streamlined cleanup system

// Add this function to handle audio player events
function setupAudioPlayerListeners(djsClient) {
    // Import the functions
    import('./handlers/menu-component-handlers.js').then(({ updatePlaybackControlsEmbed, guildQueueDisplayPreference }) => {
        // Listen for when songs start playing
        djsClient.on('audioPlayerStart', async (guildId, session) => {
            console.log(`[AudioPlayer] Song started playing in guild ${guildId}`);
            
            // Clear error embed when music resumes successfully
            try {
                const { clearErrorEmbed } = await import('./ui/services/error-tracking.js');
                await clearErrorEmbed(guildId, djsClient);
            } catch (error) {
                console.log(`[AudioPlayer] Could not clear error embed for guild ${guildId}:`, error.message);
            }
            
            // Only update if session exists and is valid
            if (session && session.connection && session.connection.state.status !== 'destroyed') {
                const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
                
                if (displayPref === 'menu') {
                    // REMOVED: Embed update - now handled by state listener in audio-session.js
                    // This prevents duplicate embed updates and ensures proper loading state display
                } else if (displayPref === 'chat') {
                    // Update chat queue message for chat mode
                    const { updatePersistentQueueMessage } = await import('./utils/helpers/message-helpers.js');
                    await updatePersistentQueueMessage(guildId, djsClient, session, false);
                }
                
                // REMOVED: Preload logic moved to audioPlayerEnd event
            }
        });
        
        // Listen for forced embed updates (when loading state is cleared)
        djsClient.on('forceEmbedUpdate', async (guildId, session) => {
            console.log(`[AudioPlayer] Force embed update requested for guild ${guildId} (loading state cleared)`);
            
            // Only update if session exists and is valid
            if (session && session.connection && session.connection.state.status !== 'destroyed') {
                const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
                
                if (displayPref === 'menu') {
                    await updatePlaybackControlsEmbed(guildId, djsClient, session);
                    console.log(`[AudioPlayer] Force embed update completed for guild ${guildId}`);
                } else if (displayPref === 'chat') {
                    // Update chat queue message for chat mode
                    const { updatePersistentQueueMessage } = await import('./utils/helpers/message-helpers.js');
                    await updatePersistentQueueMessage(guildId, djsClient, session, false);
                }
            }
        });
        
        // Listen for when songs end
        djsClient.on('audioPlayerEnd', async (guildId, session) => {
            console.log(`[AudioPlayer] Song ended in guild ${guildId}`);
            
            // NOTE: Temp file cleanup is now handled in audio-session.js after FFmpeg process cleanup
            // This prevents the "file in use" error when trying to delete temp files too early
            
            // Only update if session exists and is valid
            if (session && session.connection && session.connection.state.status !== 'destroyed') {
                const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
                
                if (displayPref === 'menu') {
                    await updatePlaybackControlsEmbed(guildId, djsClient, session);
                } else if (displayPref === 'chat') {
                    // Update chat queue message for chat mode
                    const { updatePersistentQueueMessage } = await import('./utils/helpers/message-helpers.js');
                    await updatePersistentQueueMessage(guildId, djsClient, session, false);
                }
                
                // REMOVED: Preload logic moved to queueChanged event
            }
            // Song ended - no additional cleanup needed
        });
        
        // Listen for when songs are paused/resumed
        djsClient.on('audioPlayerStateChange', async (guildId, session, oldState, newState) => {
            console.log(`[AudioPlayer] State changed in guild ${guildId}: ${oldState.status} -> ${newState.status}`);
            
            // CRITICAL: Clear voice timeout when music starts playing
            if (newState.status === 'playing' || newState.status === 'buffering') {
                try {
                    const { clearVoiceTimeout } = await import('./handlers/menu-component-handlers.js');
                    clearVoiceTimeout(guildId);
                    console.log(`[AudioPlayer] Cleared voice timeout for guild ${guildId} - music started playing`);
                } catch (error) {
                    console.warn(`[AudioPlayer] Error clearing voice timeout for guild ${guildId}:`, error.message);
                }
            }
            
            // CRITICAL: Update playback controls when audio actually starts playing
            if (newState.status === 'playing' && session && session.nowPlaying) {
                try {
                    console.log(`[AudioPlayer] 🎵 Audio started playing - updating playback controls for guild ${guildId}`);
                    
                    // State-driven: clear loading via StateCoordinator
                    try {
                        const { StateCoordinator } = await import('./services/state-coordinator.js');
                        // Clear loading state by setting it to idle
                        await StateCoordinator.setIdleState(guildId);
                    } catch (e) {
                        console.log(`[AudioPlayer] State loading clear error:`, e.message);
                    }
                    
                    // Send initial playback controls message if none exists
                    const { MessageReferenceManager, MESSAGE_TYPES } = await import('./message/reference-managers.js');
                    const messageRef = MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
                    
                    if (!messageRef) {
                        console.log(`[AudioPlayer] No playback controls message found, sending initial message for guild ${guildId}`);
                        
                        // Get the channel where the bot is connected
                        const channelId = session.connection.joinConfig.channelId;
                        const guild = await djsClient.guilds.fetch(guildId);
                        const textChannel = await guild.channels.fetch(channelId);
                        
                        // Use new message system
                        const { updatePlaybackControlsEmbed } = await import('./message/update-handlers.js');
                        await updatePlaybackControlsEmbed(guildId, djsClient);
                        
                        console.log(`[AudioPlayer] ✅ Sent and stored initial playback controls message for guild ${guildId}`);
                    } else {
                        // Update existing playback controls message
                        await updatePlaybackControlsEmbed(guildId, djsClient, session);
                        console.log(`[AudioPlayer] ✅ Updated existing playback controls for guild ${guildId}`);
                    }
                } catch (updateError) {
                    console.log(`[AudioPlayer] Playback controls update error:`, updateError.message);
                }
            }
            
            // CRITICAL: Start voice timeout when music stops and queue is empty
            if (newState.status === 'idle') {
                try {
                    const session = guildAudioSessions.get(guildId);
                    if (session && (!session.queue || session.queue.length === 0)) {
                        const { startOrResetVoiceTimeout } = await import('./handlers/menu-component-handlers.js');
                        startOrResetVoiceTimeout(guildId, djsClient);
                        console.log(`[AudioPlayer] Started voice timeout for guild ${guildId} - music stopped, queue empty`);
                    }
                } catch (error) {
                    console.warn(`[AudioPlayer] Error starting voice timeout for guild ${guildId}:`, error.message);
                }
            }
            
            // NOTE: Temp file cleanup is now handled in audio-session.js after FFmpeg process cleanup
            // This prevents the "file in use" error when trying to delete temp files too early
            
            // OPTIMIZATION: Only update if session exists and is valid, and state actually changed
            if (session && session.connection && session.connection.state.status !== 'destroyed' && oldState.status !== newState.status) {
                const displayPref = guildQueueDisplayPreference.get(guildId) || 'chat';
                
            // FIXED: Only update for meaningful state changes that actually affect the UI
            // Don't update for buffering states during normal playback
            const meaningfulStates = ['playing', 'paused', 'idle'];
            if (meaningfulStates.includes(newState.status) && oldState.status !== newState.status) {
                if (displayPref === 'menu') {
                    await updatePlaybackControlsEmbed(guildId, djsClient, session);
                } else if (displayPref === 'chat') {
                    // Update chat queue message for chat mode
                    const { updatePersistentQueueMessage } = await import('./utils/helpers/message-helpers.js');
                    await updatePersistentQueueMessage(guildId, djsClient, session, false);
                }
            }
            }
        });
        
        // NOTE: Duplicate audioPlayerEnd handler removed - temp file cleanup is now handled in audio-session.js
        // This prevents the "file in use" error when trying to delete temp files too early
        
        // NEW: Listen for queue changes to automatically update BOTH the queue panel AND chat message
        djsClient.on('queueChanged', async (guildId, session) => {
            console.log(`[AudioPlayer] Queue changed in guild ${guildId}`);
            
            // Clear voice timeout when songs are added to queue
            try {
                const { clearVoiceTimeout } = await import('./handlers/menu-component-handlers.js');
                clearVoiceTimeout(guildId);
                console.log(`[AudioPlayer] Cleared voice timeout for guild ${guildId} - queue changed`);
            } catch (error) {
                console.warn(`[AudioPlayer] Error clearing voice timeout for guild ${guildId}:`, error.message);
            }
            
            // CENTRALIZED PLAYBACK: Handle playback and preloading when queue changes
            if (session.queue && session.queue.length > 0) {
                const nextSong = session.queue[0];
                
                // CRITICAL: Check StateCoordinator for querying/loading states
                const { StateCoordinator } = await import('./services/state-coordinator.js');
                const trackedState = StateCoordinator.getCurrentTrackedState(guildId);
                const isQuerying = trackedState?.currentState === 'querying';
                const isLoading = trackedState?.currentState === 'loading';
                
                // IMPROVED CHECK: Should we start playback immediately?
                // Only start playback if:
                // 1. No song is currently playing (nowPlaying is null)
                // 2. Player is not currently playing (isPlaying is false)
                // 3. We're not already starting a song (isStarting is false)
                // 4. NOT currently querying or loading another song
                let shouldStartPlayback = !session.nowPlaying && 
                                         !session.isPlaying && 
                                         !session.isStarting &&
                                         !isQuerying &&
                                         !isLoading;
                
                
                console.log(`[AudioPlayer] 🔍 Queue change playback check:`, {
                    hasNextSong: !!nextSong,
                    nextSongTitle: nextSong?.title,
                    nowPlaying: !!session.nowPlaying,
                    nowPlayingTitle: session.nowPlaying?.title || 'None',
                    isPlaying: session.isPlaying,
                    isStarting: session.isStarting,
                    isQuerying,
                    isLoading,
                    shouldStartPlayback,
                    queueLength: session.queue?.length || 0
                });
                
                if (shouldStartPlayback) {
                    console.log(`[AudioPlayer] 🎵 STARTING PLAYBACK: No song currently playing, starting next song: "${nextSong.title}"`);
                    
                    // Let QueueManager handle auto-advance with proper processing
                    const { queueManager } = await import('./utils/services/queue-manager.js');
                    await queueManager.handleAutoAdvance(guildId);
                } else {
                    // PRELOAD: Only preload if we're already playing
                    const shouldPreload = nextSong && 
                        !nextSong.processedTempFile && 
                        !nextSong.isPreloading && 
                        !nextSong.preloadCompleted &&
                        nextSong !== session.nowPlaying &&
                        // Don't preload immediately after shuffle to avoid wasted downloads
                        !session.justShuffled;
                    
                    if (shouldPreload) {
                        console.log(`[AudioPlayer] 🚀 IMMEDIATE PRELOAD: Using preloader for next song: "${nextSong.title}"`);
                        
                        try {
                            const { preloader } = await import('./utils/services/preloader.js');
                            await preloader.preloadNextSong(guildId, session);
                            console.log(`[AudioPlayer] ✅ Immediate preload completed for "${nextSong.title}"`);
                        } catch (preloadError) {
                            console.error(`[AudioPlayer] ❌ IMMEDIATE PRELOAD FAILED for "${nextSong.title}":`, preloadError.message);
                        }
                    } else if (nextSong && (nextSong.processedTempFile || nextSong.isPreloading || nextSong.preloadCompleted)) {
                        console.log(`[AudioPlayer] 📝 PRELOAD: Next song "${nextSong.title}" already preloaded or being preloaded`);
                    } else if (nextSong === session.nowPlaying) {
                        console.log(`[AudioPlayer] 📝 PRELOAD: Next song "${nextSong.title}" is currently playing, skipping preload`);
                    } else if (nextSong && session.justShuffled) {
                        console.log(`[AudioPlayer] 📝 PRELOAD: Just shuffled, skipping preload to avoid wasted downloads`);
                    } else {
                        console.log(`[AudioPlayer] 📝 PRELOAD: No song to preload or song not ready`);
                    }
                }
            }
            
            // Only update if session exists and is valid
            if (session && session.connection && session.connection.state.status !== 'destroyed') {
                console.log(`[AudioPlayer] Updating both queue panel and chat message for guild ${guildId}`);
                
                // FIXED: Always update BOTH systems to keep them synchronized
                // This prevents the duplication problem where chat and menu show different information
                
                try {
                    // Update the playback controls embed to show the current queue count
                    const { updatePlaybackControlsEmbed } = await import('./handlers/menu-component-handlers.js');
                    await updatePlaybackControlsEmbed(guildId, djsClient, session);
                    
                    console.log(`[AudioPlayer] ✅ Updated playback controls with queue count for guild ${guildId}`);
                } catch (error) {
                    console.error(`[AudioPlayer] Error updating playback controls for guild ${guildId}:`, error.message);
                }
            }
        });

        // Clean up temp files when the bot shuts down
        process.on('SIGINT', async () => {
            console.log('[Bot] Received SIGINT, cleaning up...');
            try {
                // CRITICAL: Stop all timers
                // Memory monitor timer cleanup (if exists)
                try {
                    if (typeof memoryMonitorTimer !== 'undefined' && memoryMonitorTimer) {
                        clearInterval(memoryMonitorTimer);
                        memoryMonitorTimer = null;
                    }
                } catch (error) {
                    console.warn('[Bot] Memory monitor timer cleanup error:', error.message);
                }
                
                const { stopMemoryCleanup } = await import('./handlers/common/audio-session.js');
                stopMemoryCleanup();
                
                const { stopDeadlockCheck } = await import('./utils/core/processing-locks.js');
                stopDeadlockCheck();
                
                await cleanupAllTempFiles();
            } catch (error) {
                console.error('[Bot] Error cleaning up:', error.message);
            }
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('[Bot] Received SIGTERM, cleaning up...');
            try {
                // CRITICAL: Stop all timers
                // Memory monitor timer cleanup (if exists)
                try {
                    if (typeof memoryMonitorTimer !== 'undefined' && memoryMonitorTimer) {
                        clearInterval(memoryMonitorTimer);
                        memoryMonitorTimer = null;
                    }
                } catch (error) {
                    console.warn('[Bot] Memory monitor timer cleanup error:', error.message);
                }
                
                const { stopMemoryCleanup } = await import('./handlers/common/audio-session.js');
                stopMemoryCleanup();
                
                const { stopDeadlockCheck } = await import('./utils/core/processing-locks.js');
                stopDeadlockCheck();
                
                await cleanupAllTempFiles();
            } catch (error) {
                console.error('[Bot] Error cleaning up:', error.message);
            }
            process.exit(0);
        });
    });
    
    // Import and start periodic queue cleanup
    import('./utils/helpers/message-helpers.js').then(({ startPeriodicQueueCleanup }) => {
        console.log('Starting periodic queue message cleanup...');
        startPeriodicQueueCleanup(djsClient);
    });
}

// Asynchronous function to log in the bot
async function startBot() {
  if (!process.env.BOT_TOKEN) {
    console.error('ERROR: BOT_TOKEN is not set in your .env file.');
    console.error('Please create a .env file in the project root with BOT_TOKEN=your_bot_token');
    process.exit(1); // Exit if the token is missing
  }
  
  if (!process.env.APP_ID) {
    console.error('ERROR: CLIENT_ID is not set in your .env file.');
    console.error('Please add CLIENT_ID=your_application_id to your .env file');
    process.exit(1);
  }
  
  try {
    await client.login(process.env.BOT_TOKEN);
    console.log('Discord.js client successfully logged in.');
  } catch (error) {
    console.error('Failed to log in Discord.js client:', error);
    process.exit(1); // Exit if login fails
  }
}

// Add cleanup handlers for graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await cleanupOnShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await cleanupOnShutdown();
  process.exit(0);
});

// NEW: Handle yt-dlp process events to prevent crashes
process.on('exit', (code) => {
  if (code === 101) {
    console.log('[Bot] yt-dlp process exit detected (code 101), this is normal for failed audio sessions');
    // Don't treat this as a fatal error
  }
});

// Global error handlers to prevent "write EOF" crashes
process.on('uncaughtException', async (error) => {
  console.error('[Bot] Uncaught exception:', error);
  
  // If it's a "write EOF" error, try to clean up gracefully
  if (error.code === 'EOF' && error.syscall === 'write') {
    console.log('[Bot] Detected write EOF error, attempting graceful cleanup...');
    try {
      await cleanupOnShutdown();
    } catch (cleanupError) {
      console.error('[Bot] Error during EOF cleanup:', cleanupError);
    }
  }
  
  // Don't exit immediately for EOF errors, let the cleanup complete
  if (error.code !== 'EOF') {
    console.log('[Bot] Critical error detected, but preventing crash to maintain bot stability');
    // Don't exit - let the bot continue running
    // process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Bot] Unhandled rejection at:', promise, 'reason:', reason);
  
  // If it's related to streams/sockets, try to clean up
  if (reason && reason.code === 'EOF') {
    console.log('[Bot] Detected EOF rejection, attempting cleanup...');
    cleanupOnShutdown().catch(cleanupError => {
      console.error('[Bot] Error during EOF rejection cleanup:', cleanupError);
    });
  }
  
  // NEW: Handle yt-dlp process rejections gracefully
  if (reason && reason.message && reason.message.includes('Error code:')) {
    console.log('[Bot] Detected yt-dlp process rejection, this is a known issue with individual sessions');
    console.log('[Bot] Individual session will fail but bot will continue running');
    
    // Try to track this error if we can identify the guild
    try {
      // Extract guild ID from error message if possible
      const guildMatch = reason.message.match(/guild (\d+)/);
      if (guildMatch) {
        const guildId = guildMatch[1];
        console.log(`[Bot] Attempting to track yt-dlp rejection for guild ${guildId}`);
        
        // Import and call error tracking
        import('./handlers/menu-component-handlers.js').then(async ({ trackError }) => {
          try {
            await trackError(guildId, 'yt-dlp Process Rejection', 
              `yt-dlp process rejected: ${reason.message}`, client);
          } catch (trackingError) {
            console.log(`[Bot] Could not track error for guild ${guildId}:`, trackingError.message);
          }
        }).catch(importError => {
          console.log(`[Bot] Could not import error tracking:`, importError.message);
        });
      }
    } catch (trackingError) {
      console.log(`[Bot] Error in error tracking:`, trackingError.message);
    }
    
    // Don't crash the bot for yt-dlp process failures
    return;
  }
  
  // NEW: Handle timeout-related rejections
  if (reason && reason.message && (
    reason.message.includes('timeout') || 
    reason.message.includes('Timeout') ||
    reason.message.includes('setTimeout')
  )) {
    console.log('[Bot] Detected timeout-related rejection, this is expected behavior');
    console.log('[Bot] Bot will continue running');
    return; // Don't crash the bot
  }
});


async function cleanupOnShutdown() {
  try {
    console.log('Cleaning up resources...');
    
    // Stop periodic queue cleanup
    const { stopPeriodicQueueCleanup } = await import('./utils/helpers/message-helpers.js');
    stopPeriodicQueueCleanup();
    
    // Stop cache cleanup timer
    // REMOVED: stopCacheCleanup - functionality moved to unified ytdlp service
    
    // Stop memory cleanup timers
    const { stopMemoryCleanup } = await import('./handlers/common/audio-session.js');
    stopMemoryCleanup();
    
    // Cleanup systems are now consolidated - no separate timers to stop
    
    // Clean up all guild processes
    const { cleanupService } = await import('./utils/services/cleanup-service.js');
    cleanupService.cleanupAllGuildProcesses();
    
    // Disconnect from all voice channels with proper cleanup
    if (client && client.voice && client.voice.connections) {
      try {
        // Convert to array if it's a Map or Collection
        const connections = Array.from(client.voice.connections.entries());
        for (const [guildId, connection] of connections) {
          try {
            // Use proper cleanup function
            const { destroyVoiceConnection } = await import('./handlers/common/audio-session.js');
            destroyVoiceConnection(connection, guildId);
            console.log(`Disconnected from voice channel in guild ${guildId}`);
          } catch (error) {
            console.error(`Error disconnecting from guild ${guildId}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Error iterating voice connections:`, error.message);
      }
    }
    
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Function to clean up all temp files - now uses centralized file deletion service
async function cleanupAllTempFiles() {
    console.log('[Bot] 🧹 Starting comprehensive temp file cleanup...');
    try {
        const { fileDeletionService } = await import('./utils/services/file-deletion-service.js');
        
        // Use centralized file deletion service for temp directory cleanup
        const result = await fileDeletionService.cleanupTempDirectory('bot startup cleanup');
        
        console.log(`[Bot] 🧹 Cleaned up ${result.deleted} temp files successfully`);
        return result.deleted;
    } catch (error) {
        console.error('[Bot] Error during temp file cleanup:', error.message);
        return 0;
    }
}

// Export cleanup function for external use
global.cleanupAllTempFiles = cleanupAllTempFiles;

// Export the client instance and the startBot function so app.js can use them
export { client, startBot };