// utils/database/messageRefs.js
import { getPool } from './index.js';

/**
 * Ensure table exists (idempotent)
 */
async function ensureTable() {
    const pool = getPool();
    await pool.query(`
        CREATE TABLE IF NOT EXISTS message_refs (
            guild_id TEXT NOT NULL,
            type TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, type)
        )
    `);
}

export async function upsertMessageRef(guildId, type, channelId, messageId) {
    await ensureTable();
    const pool = getPool();
    await pool.query(
        `INSERT INTO message_refs (guild_id, type, channel_id, message_id, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id, type) DO UPDATE SET
           channel_id = EXCLUDED.channel_id,
           message_id = EXCLUDED.message_id,
           updated_at = CURRENT_TIMESTAMP`,
        [guildId, type, channelId, messageId]
    );
    return { guildId, type, channelId, messageId };
}

export async function getMessageRefDb(guildId, type) {
    await ensureTable();
    const pool = getPool();
    const res = await pool.query(
        `SELECT channel_id, message_id FROM message_refs WHERE guild_id = $1 AND type = $2`,
        [guildId, type]
    );
    if (!res.rows[0]) return null;
    return { channelId: res.rows[0].channel_id, messageId: res.rows[0].message_id };
}

export async function deleteMessageRef(guildId, type) {
    await ensureTable();
    const pool = getPool();
    await pool.query(
        `DELETE FROM message_refs WHERE guild_id = $1 AND type = $2`,
        [guildId, type]
    );
    return true;
}


