// utils/database/guildGifs.js
import { getPool } from './index.js';

// Default GIFs that will be used if no custom GIFs are set
const DEFAULT_GIFS = [
    'https://media.giphy.com/media/l4Jzi0iyKHLe1qT9S/giphy.gif?cid=ecf05e477c1dad93eddbb100218988b518a0b3cfa32b0685&ep=v1_user_favorites&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/3o7qDY4i2y453yJ7X2/giphy.gif?cid=ecf05e47167d9c2858ef85eb8488719026ce83b3c8f502ef&ep=v1_user_favorites&rid=giphy.gif&ct=g',
];

/**
 * Gets the GIF URLs for a specific guild.
 * If custom mode is enabled, returns only custom GIFs (even if empty).
 * If custom mode is disabled or not set, returns default GIFs.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<string[]>} Array of GIF URLs.
 */
export async function getGuildGifs(guildId) {
    console.log(`[GIF_DB_DEBUG] getGuildGifs called for guild ${guildId}`);
    const pool = getPool();
    const result = await pool.query('SELECT gif_urls, use_custom_gifs FROM guild_gifs WHERE guild_id = $1', [guildId]);
    
    console.log(`[GIF_DB_DEBUG] Database query result:`, result.rows);
    
    // If no record exists, use defaults
    if (result.rows.length === 0) {
        console.log(`[GIF_DB_DEBUG] No guild record found, returning defaults for guild ${guildId}`);
        return DEFAULT_GIFS;
    }
    
    const useCustom = result.rows[0].use_custom_gifs || false;
    const customGifs = result.rows[0].gif_urls || [];
    
    console.log(`[GIF_DB_DEBUG] Mode check - useCustom: ${useCustom}, customGifs count: ${customGifs.length}`);
    console.log(`[GIF_DB_DEBUG] Custom GIFs array:`, customGifs);
    
    // If custom mode is explicitly enabled, return custom GIFs (even if empty)
    if (useCustom) {
        console.log(`[GIF_DB_DEBUG] Custom GIFs enabled, returning ${customGifs.length} custom GIFs for guild ${guildId}`);
        if (customGifs.length === 0) {
            console.log(`[GIF_DB_DEBUG] WARNING: Custom mode enabled but no custom GIFs available - returning empty array`);
        }
        return customGifs; // This could be an empty array if no custom GIFs exist
    } else {
        console.log(`[GIF_DB_DEBUG] Custom GIFs disabled, returning defaults for guild ${guildId}`);
        return DEFAULT_GIFS;
    }
}

/**
 * Adds a new GIF URL to a guild's collection.
 * @param {string} guildId The Discord guild ID.
 * @param {string} gifUrl The GIF URL to add.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function addGuildGif(guildId, gifUrl) {
    console.log(`[GIF_DB_DEBUG] addGuildGif called for guild ${guildId} with URL: ${gifUrl}`);
    try {
        const pool = getPool();
        
        // Get current custom GIFs from database (not the mixed result from getGuildGifs)
        const result = await pool.query('SELECT gif_urls FROM guild_gifs WHERE guild_id = $1', [guildId]);
        let currentCustomGifs = [];
        
        if (result.rows.length > 0 && result.rows[0].gif_urls) {
            currentCustomGifs = result.rows[0].gif_urls;
        }

        console.log(`[GIF_DB_DEBUG] Current custom GIFs for guild ${guildId}:`, currentCustomGifs);

        // Check if URL is already in the custom list
        if (currentCustomGifs.includes(gifUrl)) {
            console.log(`[GIF_DB_DEBUG] GIF URL already exists for guild ${guildId}`);
            return { success: false, message: 'This GIF URL is already in your collection.' };
        }

        // Validate URL format
        if (!gifUrl.match(/^https?:\/\/.+\.(gif|webp|mp4|webm)$/i)) {
            console.log(`[GIF_DB_DEBUG] Invalid URL format for guild ${guildId}: ${gifUrl}`);
            return { success: false, message: 'Please provide a valid GIF, WebP, MP4, or WebM URL.' };
        }

        const newCustomGifs = [...currentCustomGifs, gifUrl];
        console.log(`[GIF_DB_DEBUG] New custom GIFs array for guild ${guildId}:`, newCustomGifs);

        await pool.query(
            `INSERT INTO guild_gifs (guild_id, gif_urls, use_custom_gifs, last_updated) 
             VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP) 
             ON CONFLICT (guild_id) DO UPDATE SET 
             gif_urls = $2, use_custom_gifs = TRUE, last_updated = CURRENT_TIMESTAMP`,
            [guildId, newCustomGifs]
        );

        console.log(`[GIF_DB_DEBUG] Successfully added GIF for guild ${guildId}`);
        return { success: true, message: 'GIF added successfully! Custom GIFs are now enabled.' };
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error adding GIF for guild ${guildId}:`, error);
        return { success: false, message: 'Failed to add GIF. Please try again.' };
    }
}

/**
 * Removes a GIF URL from a guild's collection.
 * @param {string} guildId The Discord guild ID.
 * @param {string} gifUrl The GIF URL to remove.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function removeGuildGif(guildId, gifUrl) {
    console.log(`[GIF_DB_DEBUG] removeGuildGif called for guild ${guildId} with URL: ${gifUrl}`);
    try {
        const pool = getPool();
        
        // Get current custom GIFs from database (not the mixed result from getGuildGifs)
        const result = await pool.query('SELECT gif_urls, use_custom_gifs FROM guild_gifs WHERE guild_id = $1', [guildId]);
        let currentCustomGifs = [];
        let useCustom = false;
        
        if (result.rows.length > 0) {
            currentCustomGifs = result.rows[0].gif_urls || [];
            useCustom = result.rows[0].use_custom_gifs || false;
        }

        console.log(`[GIF_DB_DEBUG] Current custom GIFs for guild ${guildId}:`, currentCustomGifs);

        // Check if URL exists in the custom list
        if (!currentCustomGifs.includes(gifUrl)) {
            console.log(`[GIF_DB_DEBUG] GIF URL not found for guild ${guildId}: ${gifUrl}`);
            return { success: false, message: 'This GIF URL is not in your collection.' };
        }

        const newCustomGifs = currentCustomGifs.filter(url => url !== gifUrl);
        console.log(`[GIF_DB_DEBUG] New custom GIFs array after removal for guild ${guildId}:`, newCustomGifs);

        // If removing all custom GIFs, we have two options:
        // 1. If custom mode is enabled, keep the record but with empty array
        // 2. If custom mode is disabled, delete the record to fall back to defaults
        if (newCustomGifs.length === 0) {
            if (useCustom) {
                // Keep custom mode enabled but with empty array
                console.log(`[GIF_DB_DEBUG] All custom GIFs removed but keeping custom mode enabled for guild ${guildId}`);
                await pool.query(
                    'UPDATE guild_gifs SET gif_urls = $1, last_updated = CURRENT_TIMESTAMP WHERE guild_id = $2',
                    [[], guildId]
                );
            } else {
                // Delete the record to fall back to defaults
                console.log(`[GIF_DB_DEBUG] Removing all custom GIFs for guild ${guildId}, deleting record`);
                await pool.query('DELETE FROM guild_gifs WHERE guild_id = $1', [guildId]);
            }
        } else {
            console.log(`[GIF_DB_DEBUG] Updating GIFs for guild ${guildId}`);
            await pool.query(
                'UPDATE guild_gifs SET gif_urls = $1, last_updated = CURRENT_TIMESTAMP WHERE guild_id = $2',
                [newCustomGifs, guildId]
            );
        }

        console.log(`[GIF_DB_DEBUG] Successfully removed GIF for guild ${guildId}`);
        return { success: true, message: 'GIF removed successfully!' };
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error removing GIF for guild ${guildId}:`, error);
        return { success: false, message: 'Failed to remove GIF. Please try again.' };
    }
}

/**
 * Resets a guild's GIF collection to the default GIFs.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function resetGuildGifs(guildId) {
    console.log(`[GIF_DB_DEBUG] resetGuildGifs called for guild ${guildId}`);
    try {
        const pool = getPool();
        await pool.query('DELETE FROM guild_gifs WHERE guild_id = $1', [guildId]);
        console.log(`[GIF_DB_DEBUG] Successfully reset GIFs for guild ${guildId}`);
        return { success: true, message: 'GIF collection reset to defaults!' };
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error resetting GIFs for guild ${guildId}:`, error);
        return { success: false, message: 'Failed to reset GIFs. Please try again.' };
    }
}

/**
 * Gets a random GIF URL from a guild's collection.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<string>} A random GIF URL, or null if no GIFs available.
 */
export async function getRandomGuildGif(guildId) {
    console.log(`[GIF_DB_DEBUG] getRandomGuildGif called for guild ${guildId}`);
    const gifs = await getGuildGifs(guildId);
    
    if (!gifs || gifs.length === 0) {
        console.log(`[GIF_DB_DEBUG] No GIFs available for guild ${guildId}`);
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * gifs.length);
    const selectedGif = gifs[randomIndex];
    console.log(`[GIF_DB_DEBUG] Selected random GIF for guild ${guildId}: ${selectedGif}`);
    return selectedGif;
}

/**
 * Gets the count of custom GIFs for a guild.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<number>} Number of custom GIFs.
 */
export async function getGuildGifCount(guildId) {
    console.log(`[GIF_DB_DEBUG] getGuildGifCount called for guild ${guildId}`);
    const result = await getPool().query('SELECT gif_urls FROM guild_gifs WHERE guild_id = $1', [guildId]);
    let customGifs = [];
    
    if (result.rows.length > 0 && result.rows[0].gif_urls) {
        customGifs = result.rows[0].gif_urls;
    }
    
    console.log(`[GIF_DB_DEBUG] Found ${customGifs.length} custom GIFs for guild ${guildId}`);
    return customGifs.length;
}

/**
 * Toggles between custom and default GIFs for a guild.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<{success: boolean, message: string, useCustom: boolean}>} Result of the toggle operation.
 */
export async function toggleGifMode(guildId) {
    console.log(`[GIF_DB_DEBUG] toggleGifMode called for guild ${guildId}`);
    try {
        const pool = getPool();
        const result = await pool.query('SELECT gif_urls, use_custom_gifs FROM guild_gifs WHERE guild_id = $1', [guildId]);
        
        let currentMode = false;
        let currentGifs = [];
        
        if (result.rows.length > 0) {
            currentMode = result.rows[0].use_custom_gifs || false;
            currentGifs = result.rows[0].gif_urls || [];
        }
        
        const newMode = !currentMode;
        
        if (newMode && currentGifs.length === 0) {
            return { success: false, message: 'No custom GIFs available. Add some GIFs first before enabling custom mode.', useCustom: false };
        }
        
        await pool.query(
            `INSERT INTO guild_gifs (guild_id, gif_urls, use_custom_gifs, last_updated) 
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
             ON CONFLICT (guild_id) DO UPDATE SET 
             use_custom_gifs = $3, last_updated = CURRENT_TIMESTAMP`,
            [guildId, currentGifs, newMode]
        );
        
        const modeText = newMode ? 'custom' : 'default';
        console.log(`[GIF_DB_DEBUG] Successfully toggled GIF mode for guild ${guildId} to ${modeText}`);
        return { 
            success: true, 
            message: `Switched to ${modeText} GIFs!`, 
            useCustom: newMode 
        };
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error toggling GIF mode for guild ${guildId}:`, error);
        return { success: false, message: 'Failed to toggle GIF mode. Please try again.', useCustom: false };
    }
}

/**
 * Gets the current GIF mode for a guild.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<boolean>} True if custom GIFs are enabled, false for defaults.
 */
export async function getGifMode(guildId) {
    console.log(`[GIF_DB_DEBUG] getGifMode called for guild ${guildId}`);
    try {
        const pool = getPool();
        const result = await pool.query('SELECT use_custom_gifs FROM guild_gifs WHERE guild_id = $1', [guildId]);
        
        if (result.rows.length === 0) {
            return false; // Default to false if no record exists
        }
        
        const useCustom = result.rows[0].use_custom_gifs || false;
        console.log(`[GIF_DB_DEBUG] GIF mode for guild ${guildId}: ${useCustom ? 'custom' : 'default'}`);
        return useCustom;
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error getting GIF mode for guild ${guildId}:`, error);
        return false; // Default to false on error
    }
}

/**
 * Debug function to check and fix database state for a guild.
 * This ensures the use_custom_gifs column exists and has proper values.
 * @param {string} guildId The Discord guild ID.
 * @returns {Promise<{success: boolean, message: string, fixed: boolean}>} Result of the check/fix operation.
 */
export async function debugAndFixGifDatabase(guildId) {
    console.log(`[GIF_DB_DEBUG] debugAndFixGifDatabase called for guild ${guildId}`);
    try {
        const pool = getPool();
        
        // First, check if the column exists
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'guild_gifs' 
            AND column_name = 'use_custom_gifs'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log(`[GIF_DB_DEBUG] use_custom_gifs column missing, adding it`);
            await pool.query('ALTER TABLE guild_gifs ADD COLUMN use_custom_gifs BOOLEAN DEFAULT FALSE');
        }
        
        // Now check the current state
        const result = await pool.query('SELECT gif_urls, use_custom_gifs FROM guild_gifs WHERE guild_id = $1', [guildId]);
        
        if (result.rows.length === 0) {
            console.log(`[GIF_DB_DEBUG] No record found for guild ${guildId}`);
            return { success: true, message: 'No GIF record found for this guild', fixed: false };
        }
        
        const currentGifs = result.rows[0].gif_urls || [];
        const currentMode = result.rows[0].use_custom_gifs;
        
        console.log(`[GIF_DB_DEBUG] Current state - gifs: ${currentGifs.length}, mode: ${currentMode}`);
        
        // If there are custom GIFs but mode is not set, fix it
        if (currentGifs.length > 0 && currentMode === null) {
            console.log(`[GIF_DB_DEBUG] Fixing: Found ${currentGifs.length} custom GIFs but mode was null, setting to TRUE`);
            await pool.query(
                'UPDATE guild_gifs SET use_custom_gifs = TRUE WHERE guild_id = $1',
                [guildId]
            );
            return { success: true, message: 'Fixed: Set custom mode to TRUE for existing custom GIFs', fixed: true };
        }
        
        return { success: true, message: 'Database state is correct', fixed: false };
    } catch (error) {
        console.error(`[GIF_DB_DEBUG] Error in debugAndFixGifDatabase:`, error);
        return { success: false, message: 'Error checking/fixing database', fixed: false };
    }
}
