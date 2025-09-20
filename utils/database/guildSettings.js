// utils/database/guildSettings.js
import { getPool } from './index.js';

// Cache for guild settings to prevent duplicate database queries
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const cacheTimestamps = new Map();
const MAX_CACHE_SIZE = 50; // Limit cache to 50 guilds to prevent memory bloat

/**
 * Retrieves the settings for a specific guild.
 * If no settings are found, it returns a default object.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<Object>} The guild settings object.
 */
export async function getGuildSettings(guildId) {
    // Check cache first
    const now = Date.now();
    const cachedSettings = settingsCache.get(guildId);
    const cacheTime = cacheTimestamps.get(guildId);
    
    if (cachedSettings && cacheTime && (now - cacheTime) < CACHE_TTL) {
        console.log(`[DATABASE_CACHE] Using cached settings for guild ${guildId}`);
        return cachedSettings;
    }
    const pool = getPool();
    const result = await pool.query('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
    
    if (result.rows.length === 0) {
        // No settings exist, create default settings
        console.log(`[DATABASE_DEBUG] No settings found for guild ${guildId}, creating default settings`);
        const defaultSettings = {
            guild_id: guildId,
            voice_timeout_minutes: 5,
            queue_display_mode: 'chat',
            slash_commands_access: 'server_owner',
            components_access: 'server_owner',
            bot_controls_access: 'server_owner',
            slash_commands_roles: [],
            components_roles: [],
            bot_controls_roles: [],
            max_duration_seconds: 900 // 15 minutes default
        };
        
        // Save the default settings to the database
        await updateGuildSettings(guildId, defaultSettings);
        console.log(`[DATABASE_DEBUG] Created default settings for guild ${guildId}:`, JSON.stringify(defaultSettings, null, 2));
        
        // Cache the default settings
        settingsCache.set(guildId, defaultSettings);
        cacheTimestamps.set(guildId, now);
        
        return defaultSettings;
    }
    
    const settings = result.rows[0];
    // Consolidated debug logging - only log once with essential info
    console.log(`[DATABASE_DEBUG] Guild ${guildId} settings loaded:`, {
        voice_timeout_minutes: settings.voice_timeout_minutes,
        queue_display_mode: settings.queue_display_mode,
        slash_commands_access: settings.slash_commands_access,
        components_access: settings.components_access,
        bot_controls_access: settings.bot_controls_access,
        max_duration_seconds: settings.max_duration_seconds
    });
    
    // Ensure arrays are properly formatted
    if (settings.slash_commands_roles && !Array.isArray(settings.slash_commands_roles)) {
        console.log(`[DATABASE_DEBUG] Converting slash_commands_roles from ${typeof settings.slash_commands_roles} to array`);
        settings.slash_commands_roles = [];
    }
    if (settings.components_roles && !Array.isArray(settings.components_roles)) {
        console.log(`[DATABASE_DEBUG] Converting components_roles from ${typeof settings.components_roles} to array`);
        settings.components_roles = [];
    }
    if (settings.bot_controls_roles && !Array.isArray(settings.bot_controls_roles)) {
        console.log(`[DATABASE_DEBUG] Converting bot_controls_roles from ${typeof settings.bot_controls_roles} to array`);
        settings.bot_controls_roles = [];
    }
    
    // Cache the settings with size management
    settingsCache.set(guildId, settings);
    cacheTimestamps.set(guildId, now);
    
    // MEMORY OPTIMIZATION: Limit cache size to prevent memory bloat
    if (settingsCache.size > MAX_CACHE_SIZE) {
        // Remove oldest entries (FIFO)
        const oldestEntry = settingsCache.keys().next().value;
        settingsCache.delete(oldestEntry);
        cacheTimestamps.delete(oldestEntry);
        console.log(`[DATABASE_CACHE] Removed oldest cache entry to maintain size limit: ${oldestEntry}`);
    }
    
    return settings;
}

/**
 * Inserts or updates the settings for a guild.
 * @param {string} guildId The Discord guild ID.
 * @param {Object} settings The settings object to save.
 * @returns {Promise<pg.QueryResult>} The result of the database query.
 */
export async function updateGuildSettings(guildId, settings) {
    const pool = getPool();
    
    // Ensure all required fields have default values
    const settingsToSave = {
        voice_channel_id: settings.voice_channel_id || null,
        voice_timeout_minutes: settings.voice_timeout_minutes || 1,
        queue_display_mode: settings.queue_display_mode || 'chat',
        slash_commands_access: settings.slash_commands_access || 'server_owner',
        components_access: settings.components_access || 'server_owner',
        bot_controls_access: settings.bot_controls_access || 'server_owner',
        slash_commands_roles: settings.slash_commands_roles || [],
        components_roles: settings.components_roles || [],
        bot_controls_roles: settings.bot_controls_roles || [],
        max_duration_seconds: settings.max_duration_seconds || 900 // Default to 15 minutes
    };
    
    // Only log essential update info to reduce log spam
    console.log(`[DATABASE_DEBUG] Updating guild ${guildId} settings:`, {
        voice_timeout_minutes: settingsToSave.voice_timeout_minutes,
        queue_display_mode: settingsToSave.queue_display_mode,
        access_settings: {
            slash_commands: settingsToSave.slash_commands_access,
            components: settingsToSave.components_access,
            bot_controls: settingsToSave.bot_controls_access
        }
    });
    
    const result = await pool.query(
        `INSERT INTO guild_settings (guild_id, voice_channel_id, voice_timeout_minutes, queue_display_mode, slash_commands_access, components_access, bot_controls_access, slash_commands_roles, components_roles, bot_controls_roles, max_duration_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (guild_id) DO UPDATE SET
         voice_channel_id = $2,
         voice_timeout_minutes = $3,
         queue_display_mode = $4,
         slash_commands_access = $5,
         components_access = $6,
         bot_controls_access = $7,
         slash_commands_roles = $8,
         components_roles = $9,
         bot_controls_roles = $10,
         max_duration_seconds = $11`,
        [guildId, settingsToSave.voice_channel_id, settingsToSave.voice_timeout_minutes, settingsToSave.queue_display_mode, settingsToSave.slash_commands_access, settingsToSave.components_access, settingsToSave.bot_controls_access, settingsToSave.slash_commands_roles, settingsToSave.components_roles, settingsToSave.bot_controls_roles, settingsToSave.max_duration_seconds]
    );
    
    // Invalidate cache when settings are updated
    settingsCache.delete(guildId);
    cacheTimestamps.delete(guildId);
    console.log(`[DATABASE_CACHE] Invalidated cache for guild ${guildId} settings`);
    
    return result;
}

// You can add more functions here if needed, like deleting a guild's settings
// export async function deleteGuildSettings(guildId) { ... }