// utils/database/panels.js
import { getPool } from './index.js';

export async function getPanelInfo(guildId) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM panels WHERE guild_id = $1', [guildId]);
    return result.rows[0];
}

export async function setPanelInfo(guildId, info) {
    const pool = getPool();
    return pool.query(
        'INSERT INTO panels (guild_id, message_id, channel_id) VALUES ($1, $2, $3) ON CONFLICT (guild_id) DO UPDATE SET message_id = $2, channel_id = $3',
        [guildId, info.messageId, info.channelId]
    );
}

export async function deletePanelInfo(guildId) {
    const pool = getPool();
    return pool.query('DELETE FROM panels WHERE guild_id = $1', [guildId]);
}