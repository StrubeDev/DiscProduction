/**
 * Database service for initialization and guild preferences
 */
import { initDatabase } from '../utils/database/index.js';

export class DatabaseService {
  static async initialize() {
    try {
      console.log('[DATABASE] Initializing database...');
      const dbInitialized = await initDatabase();
      
      if (!dbInitialized) {
        console.warn('[DATABASE] Running without database functionality');
        return false;
      }
      
      console.log('[DATABASE] Database initialized successfully');
      return true;
    } catch (error) {
      console.error('[DATABASE] Failed to initialize database:', error);
      return false;
    }
  }

  static async loadGuildQueueDisplayPreferences(client) {
    try {
      console.log('[DATABASE] Loading guild queue display preferences from database...');
      const { getGuildSettings } = await import('../utils/database/guildSettings.js');
      const { guildQueueDisplayPreference } = await import('../utils/queue/display-preferences.js');
      const { guildTimeouts } = await import('../utils/timeout/voice-timeouts.js');

      // Get all guilds the bot is in
      const guilds = client.guilds.cache;
      console.log(`[DATABASE] Found ${guilds.size} guilds to load preferences for`);
      
      // Set guild count for dynamic pooling
      process.env.GUILD_COUNT = guilds.size.toString();

      // DYNAMIC LOADING: Load all guild settings from database
      console.log(`[DATABASE] Loading all guild settings from database...`);
      
      let loadedCount = 0;
      let timeoutCount = 0;
      
      for (const [guildId, guild] of guilds) {
        try {
          console.log(`[DATABASE] Loading settings for guild ${guildId} (${guild.name})`);
          const settings = await getGuildSettings(guildId);
          
          // Load queue display preference
          if (settings.queue_display_mode) {
            guildQueueDisplayPreference.set(guildId, settings.queue_display_mode);
            console.log(`[DATABASE] Loaded queue display preference for guild ${guildId}: ${settings.queue_display_mode}`);
            loadedCount++;
          }
          
          // Load voice timeout settings
          if (settings.voice_timeout_minutes !== undefined) {
            guildTimeouts.set(guildId, settings.voice_timeout_minutes);
            console.log(`[DATABASE] Loaded voice timeout for guild ${guildId}: ${settings.voice_timeout_minutes} minutes`);
            timeoutCount++;
          } else {
            // Set default timeout if none is configured
            guildTimeouts.set(guildId, 5);
            console.log(`[DATABASE] Set default voice timeout for guild ${guildId}: 5 minutes`);
            timeoutCount++;
          }
        } catch (error) {
          console.error(`[DATABASE] Error loading settings for guild ${guildId}:`, error);
          // Set defaults on error
          guildTimeouts.set(guildId, 5);
          timeoutCount++;
        }
      }

      console.log(`[DATABASE] Successfully loaded queue display preferences for ${loadedCount}/${guilds.size} guilds`);
      console.log(`[DATABASE] Successfully loaded voice timeouts for ${timeoutCount}/${guilds.size} guilds`);
      console.log(`[DATABASE] Dynamic database loading completed for ${guilds.size} guilds`);
      
      // Debug: Show what's in the guildTimeouts map
      console.log(`[DATABASE] Final guildTimeouts map:`, Object.fromEntries(guildTimeouts));
    } catch (error) {
      console.error('[DATABASE] Error loading guild queue display preferences:', error);
    }
  }
}
