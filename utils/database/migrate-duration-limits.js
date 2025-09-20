// utils/database/migrate-duration-limits.js
import { getPool } from './index.js';

/**
 * Migration script to update existing guilds that have max_duration_seconds = 0
 * to use the new default of 900 seconds (15 minutes)
 */
export async function migrateDurationLimits() {
    const pool = getPool();
    
    try {
        console.log('[MIGRATION] Starting duration limits migration...');
        
        // Update all guilds that have max_duration_seconds = 0 to 900
        const result = await pool.query(`
            UPDATE guild_settings 
            SET max_duration_seconds = 900 
            WHERE max_duration_seconds = 0 OR max_duration_seconds IS NULL
        `);
        
        console.log(`[MIGRATION] Updated ${result.rowCount} guilds to use 15-minute duration limit`);
        
        // Verify the migration
        const verifyResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM guild_settings 
            WHERE max_duration_seconds = 0 OR max_duration_seconds IS NULL
        `);
        
        const remainingZeroLimits = parseInt(verifyResult.rows[0].count);
        console.log(`[MIGRATION] Remaining guilds with no duration limit: ${remainingZeroLimits}`);
        
        if (remainingZeroLimits === 0) {
            console.log('[MIGRATION] Duration limits migration completed successfully!');
        } else {
            console.warn(`[MIGRATION] Warning: ${remainingZeroLimits} guilds still have no duration limit`);
        }
        
        return result.rowCount;
    } catch (error) {
        console.error('[MIGRATION] Error during duration limits migration:', error);
        throw error;
    }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrateDurationLimits()
        .then(count => {
            console.log(`Migration completed. Updated ${count} guilds.`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

