// app.js
import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { client, startBot } from './bot.js';
import { ClientService } from './services/client-service.js';

// MODIFIED: This import now points to the new index file in your database folder.
import { initDatabase } from './utils/database/index.js';

// Maintenance system removed - no more caching or complex cleanup

console.log(new Date().toISOString(), `[ENV_CHECK_APP_JS] Attempting to log PUBLIC_KEY from app.js.`);
const publicKeyFromEnv = process.env.PUBLIC_KEY;
console.log(new Date().toISOString(), `[ENV_CHECK_APP_JS] Raw process.env.PUBLIC_KEY: "${publicKeyFromEnv}"`);
if (publicKeyFromEnv && typeof publicKeyFromEnv === 'string' && publicKeyFromEnv.length > 0) {
  console.log(new Date().toISOString(), `[ENV_CHECK_APP_JS] PUBLIC_KEY appears to be loaded. Length: ${publicKeyFromEnv.length}`);
} else {
  console.error(new Date().toISOString(), `[ENV_CHECK_APP_JS] CRITICAL ERROR: PUBLIC_KEY IS UNDEFINED, EMPTY, or not a string.`);
  console.error(new Date().toISOString(), `[ENV_CHECK_APP_JS] Please ensure 'dotenv/config' is the first import and PUBLIC_KEY is correctly set in your .env file.`);
}

// Maintenance system removed - simplified architecture

let commandHandlers = {};
let messageComponentHandlers = {};
let modalSubmitHandlers = {};

async function initializeHandlers() {
  // Use ComponentRegistry to get all handlers
  const { ComponentRegistry } = await import('./handlers/registry/component-registry.js');
  const { messageComponentHandlers: registryMessageHandlers, modalSubmitHandlers: registryModalHandlers } = await ComponentRegistry.registerAll();
  
  // Use the handlers from the registry
  Object.assign(messageComponentHandlers, registryMessageHandlers);
  Object.assign(modalSubmitHandlers, registryModalHandlers);
  try {
    const { handleComponentsCommand } = await import('./commands/components.js');
    commandHandlers['components'] = (req, res) => handleComponentsCommand(req, res, client);
    console.log('Successfully registered "components" command handler.');
  } catch (error) {
    console.error('Failed to load "components" command handler:', error);
  }

  // MODIFIED: Import from the correct handler file
  try {
    const { handlePlayCommand } = await import('./handlers/core/play-command.js');
    if (typeof handlePlayCommand === 'function') {
      commandHandlers['play'] = (req, res) => handlePlayCommand(req, res, client);
      console.log('Successfully registered "play" command handler.');
    } else {
      console.warn('./handlers/play-command-handler.js did not export handlePlayCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "play" command handler:', error);
  }

  try {
    const stopCommandModule = await import('./commands/stop.js');
    if (stopCommandModule && typeof stopCommandModule.handleStopCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['stop'] = requireModPermissions((req, res) => stopCommandModule.handleStopCommand(req, res, client));
      console.log('Successfully registered "stop" command handler with mod permissions.');
    } else {
      console.warn('./commands/stop.js did not export handleStopCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "stop" command handler:', error);
  }

  try {
    const skipCommandModule = await import('./commands/skip.js');
    if (skipCommandModule && typeof skipCommandModule.handleSkipCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['skip'] = requireModPermissions((req, res) => skipCommandModule.handleSkipCommand(req, res, client));
      console.log('Successfully registered "skip" command handler with mod permissions.');
    } else {
      console.warn('./commands/skip.js did not export handleSkipCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "skip" command handler:', error);
  }
  try {
    const shuffleCommandModule = await import('./commands/shuffle.js');
    if (shuffleCommandModule && typeof shuffleCommandModule.handleShuffleCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['shuffle'] = requireModPermissions((req, res) => shuffleCommandModule.handleShuffleCommand(req, res, client));
      console.log('Successfully registered "shuffle" command handler with mod permissions.');
    } else {
      console.warn('./commands/shuffle.js did not export handleShuffleCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "shuffle" command handler:', error);
  }

  try {
    const resetCommandModule = await import('./commands/reset.js');
    if (resetCommandModule && typeof resetCommandModule.handleResetCommand === 'function') {
      const { requireAdminPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['reset'] = requireAdminPermissions((req, res) => resetCommandModule.handleResetCommand(req, res, client));
      console.log('Successfully registered "reset" command handler with admin permissions.');
    } else {
      console.warn('./commands/reset.js did not export handleResetCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "reset" command handler:', error);
  }

  try {
    const inspectMemoryModule = await import('./commands/inspect-memory.js');
    if (inspectMemoryModule && typeof inspectMemoryModule.handleInspectMemoryCommand === 'function') {
      commandHandlers['memory'] = (req, res) => inspectMemoryModule.handleInspectMemoryCommand(req, res, client);
      console.log('Successfully registered "memory" command handler.');
    } else {
      console.warn('./commands/inspect-memory.js did not export handleInspectMemoryCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "memory" command handler:', error);
  }

  try {
    const volumeUpCommandModule = await import('./commands/volume-up.js');
    if (volumeUpCommandModule && typeof volumeUpCommandModule.handleVolumeUpCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['volumeup'] = requireModPermissions((req, res) => volumeUpCommandModule.handleVolumeUpCommand(req, res, client));
      console.log('Successfully registered "volumeup" command handler with mod permissions.');
    } else {
      console.warn('./commands/volume-up.js did not export handleVolumeUpCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "volumeup" command handler:', error);
  }

  try {
    const volumeDownCommandModule = await import('./commands/volume-down.js');
    if (volumeDownCommandModule && typeof volumeDownCommandModule.handleVolumeDownCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['volumedown'] = requireModPermissions((req, res) => volumeDownCommandModule.handleVolumeDownCommand(req, res, client));
      console.log('Successfully registered "volumedown" command handler with mod permissions.');
    } else {
      console.warn('./commands/volume-down.js did not export handleVolumeDownCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "volumedown" command handler:', error);
  }

  try {
    const muteCommandModule = await import('./commands/mute.js');
    if (muteCommandModule && typeof muteCommandModule.handleMuteCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['mute'] = requireModPermissions((req, res) => muteCommandModule.handleMuteCommand(req, res, client));
      console.log('Successfully registered "mute" command handler with mod permissions.');
    } else {
      console.warn('./commands/mute.js did not export handleMuteCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "mute" command handler:', error);
  }

  try {
    const volumeTestCommandModule = await import('./commands/volume-test.js');
    if (volumeTestCommandModule && typeof volumeTestCommandModule.handleVolumeTestCommand === 'function') {
      const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
      commandHandlers['volumetest'] = requireModPermissions((req, res) => volumeTestCommandModule.handleVolumeTestCommand(req, res, client));
      console.log('Successfully registered "volumetest" command handler with mod permissions.');
    } else {
      console.warn('./commands/volume-test.js did not export handleVolumeTestCommand correctly or is missing.');
    }
  } catch (error) {
    console.error('Failed to load "volumetest" command handler:', error);
  }
      try {
        const menuNavHandlers = await import('./handlers/menu-component-handlers.js');
        const { routeMenuNavigation } = await import('./routers/menu-router.js');
        
        // Import tools handlers
        const { handleModAccessGranter } = await import('./handlers/tools/access-control.js');
        const { handleModGifManagement } = await import('./handlers/tools/gif-management.js');
        const { handleMenuNavTips } = await import('./handlers/tools/quick-tips.js');
        
        // Register reset button handler
        messageComponentHandlers['bot_reset'] = (req, res, data) => {
            console.log('[APP_DEBUG] Reset button handler called!');
            console.log('[APP_DEBUG] Request body:', JSON.stringify(req.body, null, 2));
            return menuNavHandlers.handleBotReset(req, res, data, client);
        };
        console.log('Successfully registered "bot_reset" button handler.');
        console.log('[APP_DEBUG] Available handlers:', Object.keys(messageComponentHandlers));
        
        // --- GIF MANAGEMENT HANDLERS ---
        messageComponentHandlers['mod_gif_management'] = (req, res, data) => handleModGifManagement(req, res, data, client);
        console.log('[GIF_DEBUG] Registered GIF management handlers:', {
          mod_gif_management: !!messageComponentHandlers['mod_gif_management']
        });
        
        // --- ACCESS CONTROL HANDLERS ---
        messageComponentHandlers['mod_access_granter'] = (req, res, data) => handleModAccessGranter(req, res, data, client);
        console.log('[ACCESS_DEBUG] Registered access control handler:', {
          mod_access_granter: !!messageComponentHandlers['mod_access_granter']
        });
        
        // Register the correct playback controls handler
        messageComponentHandlers['menu_nav_playback'] = (req, res, data) => routeMenuNavigation('menu_nav_playback', req, res, client);
        messageComponentHandlers['menu_nav_queue'] = (req, res, data) => routeMenuNavigation('menu_nav_queue_history', req, res, client);
        messageComponentHandlers['menu_nav_config'] = (req, res, data) => routeMenuNavigation('menu_nav_config', req, res, client);
        messageComponentHandlers['menu_nav_config_tools'] = (req, res, data) => routeMenuNavigation('menu_nav_config', req, res, client);
        messageComponentHandlers['menu_nav_tips'] = (req, res, data) => handleMenuNavTips(req, res, data, client);
        messageComponentHandlers['menu_nav_features'] = (req, res, data) => routeMenuNavigation('menu_nav_tools', req, res, client);
        messageComponentHandlers['menu_nav_mod_menu'] = (req, res, data) => routeMenuNavigation('menu_nav_mod', req, res, client);
        // Unified permission handlers (new system)
        messageComponentHandlers['access_unified_roles'] = (req, res, data) => menuNavHandlers.handleAccessUnifiedRoles(req, res, data, client);
        messageComponentHandlers['access_unified_everyone'] = (req, res, data) => menuNavHandlers.handleAccessUnifiedEveryone(req, res, data, client);
        messageComponentHandlers['add_unified_roles'] = (req, res, data) => menuNavHandlers.handleAddUnifiedRoles(req, res, data, client);
        messageComponentHandlers['remove_unified_roles'] = (req, res, data) => menuNavHandlers.handleRemoveUnifiedRoles(req, res, data, client);
        messageComponentHandlers['view_role_ids'] = (req, res, data) => menuNavHandlers.handleViewRoleIds(req, res, data, client);

        // Legacy handlers (keeping for backward compatibility)
        messageComponentHandlers['access_slash_roles'] = (req, res, data) => menuNavHandlers.handleAccessSlashRoles(req, res, data, client);
        messageComponentHandlers['access_slash_everyone'] = (req, res, data) => menuNavHandlers.handleAccessSlashEveryone(req, res, data, client);
        messageComponentHandlers['access_components_roles'] = (req, res, data) => menuNavHandlers.handleAccessComponentsRoles(req, res, data, client);
        messageComponentHandlers['access_components_everyone'] = (req, res, data) => menuNavHandlers.handleAccessComponentsEveryone(req, res, data, client);
        messageComponentHandlers['access_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleAccessBotControlsRoles(req, res, data, client);
        messageComponentHandlers['access_bot_controls_everyone'] = (req, res, data) => menuNavHandlers.handleAccessBotControlsEveryone(req, res, data, client);

        // View role handlers
        messageComponentHandlers['view_slash_roles'] = (req, res, data) => menuNavHandlers.handleViewSlashRoles(req, res, data, client);
        messageComponentHandlers['view_components_roles'] = (req, res, data) => menuNavHandlers.handleViewComponentsRoles(req, res, data, client);
        messageComponentHandlers['view_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleViewBotControlsRoles(req, res, data, client);

        // Clear role handlers
        messageComponentHandlers['clear_slash_roles'] = (req, res, data) => menuNavHandlers.handleClearSlashRoles(req, res, data, client);
        messageComponentHandlers['clear_components_roles'] = (req, res, data) => menuNavHandlers.handleClearComponentsRoles(req, res, data, client);
        messageComponentHandlers['clear_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleClearBotControlsRoles(req, res, data, client);
        messageComponentHandlers['menu_nav_quick_tips'] = (req, res, data) => handleMenuNavTips(req, res, data, client);
        messageComponentHandlers['menu_nav_main'] = (req, res, data) => routeMenuNavigation('menu_nav_main', req, res, client);
        messageComponentHandlers['menu_nav_bot_voice_controls'] = (req, res, data) => routeMenuNavigation('menu_nav_bot_voice_controls', req, res, client);
        messageComponentHandlers['bot_join_vc'] = (req, res, data) => menuNavHandlers.handleBotJoinVC(req, res, data, client);
        messageComponentHandlers['bot_disconnect_vc'] = (req, res, data) => menuNavHandlers.handleBotDisconnectVC(req, res, data, client);
        messageComponentHandlers['bot_vc_select_config'] = (req, res, data) => menuNavHandlers.handleBotVCSelectConfig(req, res, data, client);

        // Queue display handlers
        messageComponentHandlers['set_queue_display_menu'] = (req, res, data) => menuNavHandlers.handleSetQueueDisplayMenu(req, res, data, client);
        messageComponentHandlers['set_queue_display_chat'] = (req, res, data) => menuNavHandlers.handleSetQueueDisplayChat(req, res, data, client);

        // Remote control handlers
        messageComponentHandlers['remote_play_pause'] = (req, res, data) => menuNavHandlers.handleRemotePlayPause(req, res, data, client);
        messageComponentHandlers['remote_skip'] = (req, res, data) => menuNavHandlers.handleRemoteSkip(req, res, data, client);
        messageComponentHandlers['remote_stop'] = (req, res, data) => menuNavHandlers.handleRemoteStop(req, res, data, client);
        messageComponentHandlers['remote_shuffle'] = (req, res, data) => menuNavHandlers.handleRemoteShuffle(req, res, data, client);

        // Additional menu navigation handlers
        messageComponentHandlers['menu_nav_queue_history'] = (req, res, data) => routeMenuNavigation('menu_nav_queue_history', req, res, client);
      } catch (error) {
        console.error('Menu navigation/component handlers failed to load:', error);
      }

    // Pause/Resume command handlers in their own try-catch block
    try {
      const pauseCommandModule = await import('./commands/pause.js');
      if (pauseCommandModule) {
        if (typeof pauseCommandModule.handlePauseCommand === 'function') {
          const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
          commandHandlers['pause'] = requireModPermissions((req, res) => pauseCommandModule.handlePauseCommand(req, res, client));
          console.log('Successfully registered "pause" command handler with mod permissions.');
        }
        if (typeof pauseCommandModule.handleResumeCommand === 'function') {
          const { requireModPermissions } = await import('./middleware/permissionMiddleware.js');
          commandHandlers['resume'] = requireModPermissions((req, res) => pauseCommandModule.handleResumeCommand(req, res, client));
          console.log('Successfully registered "resume" command handler with mod permissions.');
        }
      }
    } catch (error) {
      console.error('Failed to load pause/resume command handlers:', error);
    }

    messageComponentHandlers['open_set_timeout_modal'] = async (req, res) => {
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id;

        // Check config permissions
        const { checkBotControlsPermissions } = await import('./middleware/permissionMiddleware.js');
        if (!await checkBotControlsPermissions(client, guildId, userId)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need config permissions to use this control.',
              flags: 64
            }
          });
        }

        const { getSetTimeoutModalData } = await import('./ui/modal-data.js');
        const modalData = getSetTimeoutModalData();
        console.log('Attempting to send modal:', JSON.stringify(modalData, null, 2));

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modalData
        });
      } catch (error) {
        console.error("Error preparing or sending modal:", error);
        return res.status(500).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "Sorry, I couldn't open the timeout settings. Please try again.", flags: 64 }
        });
      }
    };






    // ---------------------------------

        // open_add_song_modal handler is now registered in component-registry.js

        // Add duration modal handler
        messageComponentHandlers['open_set_duration_modal'] = async (req, res) => {
          const { getSetDurationModalData } = await import('./ui/modal-data.js');
          const modalData = getSetDurationModalData();
          return res.send({
            type: InteractionResponseType.MODAL,
            data: modalData,
          });
        };

    console.log('Menu navigation and timeout modal button handlers loaded.');

  // Modal Submit Handlers


  // Modal handlers are now registered in component-registry.js to avoid duplicates


  console.log('Initialized Handlers:');
  console.log('Commands:', Object.keys(commandHandlers));
  console.log('Components:', Object.keys(messageComponentHandlers));
  console.log('Modals:', Object.keys(modalSubmitHandlers));
  
  // Debug: Show GIF-related handlers specifically
  console.log('[GIF_DEBUG] Available GIF handlers:');
  console.log('[GIF_DEBUG] Message Components:', Object.keys(messageComponentHandlers).filter(key => key.includes('gif')));
  console.log('[GIF_DEBUG] Modal Submissions:', Object.keys(modalSubmitHandlers).filter(key => key.includes('gif')));
}

async function loadGuildQueueDisplayPreferences() {
  try {
    console.log('[STARTUP] Loading guild queue display preferences from database...');
    const { getGuildSettings } = await import('./utils/database/guildSettings.js');
    const { guildQueueDisplayPreference } = await import('./utils/queue/display-preferences.js');
    const { guildTimeouts } = await import('./utils/timeout/voice-timeouts.js');

    // Get all guilds the bot is in
    const guilds = client.guilds.cache;
    console.log(`[STARTUP] Found ${guilds.size} guilds to load preferences for`);
    
    // Set guild count for dynamic pooling
    process.env.GUILD_COUNT = guilds.size.toString();

    // DYNAMIC LOADING: Load all guild settings from database
    console.log(`[STARTUP] Loading all guild settings from database...`);
    
    let loadedCount = 0;
    let timeoutCount = 0;
    for (const [guildId, guild] of guilds) {
      try {
        console.log(`[STARTUP] Loading settings for guild ${guildId} (${guild.name})`);
        const settings = await getGuildSettings(guildId);
        
        // Load queue display preference
        if (settings.queue_display_mode) {
          guildQueueDisplayPreference.set(guildId, settings.queue_display_mode);
          console.log(`[STARTUP] Loaded queue display preference for guild ${guildId}: ${settings.queue_display_mode}`);
          loadedCount++;
        }
        
        // Load voice timeout settings
        if (settings.voice_timeout_minutes !== undefined) {
          guildTimeouts.set(guildId, settings.voice_timeout_minutes);
          console.log(`[STARTUP] Loaded voice timeout for guild ${guildId}: ${settings.voice_timeout_minutes} minutes`);
          timeoutCount++;
        } else {
          // Set default timeout if none is configured
          guildTimeouts.set(guildId, 5);
          console.log(`[STARTUP] Set default voice timeout for guild ${guildId}: 5 minutes`);
          timeoutCount++;
        }
      } catch (error) {
        console.error(`[STARTUP] Error loading settings for guild ${guildId}:`, error);
        // Set defaults on error
        guildTimeouts.set(guildId, 5);
        timeoutCount++;
      }
    }

    console.log(`[STARTUP] Successfully loaded queue display preferences for ${loadedCount}/${guilds.size} guilds`);
    console.log(`[STARTUP] Successfully loaded voice timeouts for ${timeoutCount}/${guilds.size} guilds`);
    console.log(`[STARTUP] Dynamic database loading completed for ${guilds.size} guilds`);
    
    // Debug: Show what's in the guildTimeouts map
    console.log(`[STARTUP] Final guildTimeouts map:`, Object.fromEntries(guildTimeouts));
  } catch (error) {
    console.error('[STARTUP] Error loading guild queue display preferences:', error);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
  const interactionId = req.body.id;
  const interactionType = req.body.type;
  const commandName = (interactionType === InteractionType.APPLICATION_COMMAND) ? req.body.data.name : 'N/A';

  console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Type: ${interactionType} | Cmd: ${commandName} | Interaction received by /interactions endpoint.`);

  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  try {
    if (type === InteractionType.APPLICATION_COMMAND) {
      const handler = commandHandlers[data.name];
      if (handler) {
        console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Cmd: ${data.name} | Dispatching to command handler.`);
        return handler(req, res, client);
      }
    } else if (type === InteractionType.MESSAGE_COMPONENT) {
      console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | MESSAGE_COMPONENT interaction received. Full body:`, JSON.stringify(req.body, null, 2));
      const handler = messageComponentHandlers[data.custom_id];
      if (handler) {
        console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Component: ${data.custom_id} | Dispatching to component handler.`);
        return handler(req, res, data, client);
      } else {
        console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Component: ${data.custom_id} | No handler found. Available handlers:`, Object.keys(messageComponentHandlers));
      }
    } else if (type === InteractionType.MODAL_SUBMIT) {
      console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | MODAL_SUBMIT interaction received. Full body:`, JSON.stringify(req.body, null, 2));
      const handler = modalSubmitHandlers[data.custom_id];
      if (handler) {
        console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Modal: ${data.custom_id} | Dispatching to modal handler.`);
        return handler(req, res, data, client);
      } else {
        console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Modal: ${data.custom_id} | No handler found. Available handlers:`, Object.keys(modalSubmitHandlers));
      }
    }
    console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Unknown or unhandled interaction type/custom_id:`, req.body);
    return res.status(404).send({ error: 'Unknown interaction' });
  } catch (error) {
    console.error(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Error handling interaction:`, error);
    try {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "An error occurred while processing your request.", flags: 64 }
      });
    } catch (e) {
      console.error(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Failed to send error response for interaction:`, e);
    }
  }
});

startBot()
  .then(() => {
    // Register the client with ClientService
    ClientService.setClient(client);
    console.log('[APP] Client registered with ClientService');
  })
  .then(initializeHandlers)
  .then(async () => {
    const dbInitialized = await initDatabase();
    if (!dbInitialized) {
      console.warn('Running without database functionality');
    } else {
      // Load guild queue display preferences after database is initialized
      await loadGuildQueueDisplayPreferences();
    }
    
    // Set up periodic voice channel checks for timeout management
    const { checkAllVoiceChannels } = await import('./handlers/menu-component-handlers.js');
    let voiceCheckInterval = null;
    
    const startVoiceChecks = () => {
      if (voiceCheckInterval) return; // Already running
      // DISABLED: Voice checks are now event-driven in bot.js
      // No need for periodic polling since we listen to AudioPlayer state changes
      console.log('[VoiceCheck] Voice checks are now event-driven - no periodic polling needed');
    };
    
    const stopVoiceChecks = () => {
      if (voiceCheckInterval) {
        clearInterval(voiceCheckInterval);
        voiceCheckInterval = null;
        console.log('[VoiceCheck] Stopped periodic voice channel checks');
      }
    };
    
    // Start with initial check
    startVoiceChecks();
    
    // Export these functions so they can be used elsewhere
    global.startVoiceChecks = startVoiceChecks;
    global.stopVoiceChecks = stopVoiceChecks;
    
    app.listen(PORT, () => console.log('Express server listening on port', PORT));
  })
  .catch(error => {
    console.error('Failed to initialize/start services:', error);
    process.exit(1);
  });