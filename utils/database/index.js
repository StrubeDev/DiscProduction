// utils/database/index.js
import pg from 'pg';
import { createAudioMetadataTable } from './audioMetadata.js';
const { Pool } = pg;

let pool;

async function createTables() {
    // Keep the CREATE TABLE IF NOT EXISTS logic here
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panels (
        guild_id TEXT PRIMARY KEY,
        message_id TEXT,
        channel_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        voice_channel_id TEXT,
        voice_timeout_minutes INTEGER DEFAULT 5,
        queue_display_mode TEXT DEFAULT 'chat',
        slash_commands_access TEXT DEFAULT 'server_owner',
        components_access TEXT DEFAULT 'server_owner',
        bot_controls_access TEXT DEFAULT 'server_owner',
        slash_commands_roles TEXT[] DEFAULT '{}',
        components_roles TEXT[] DEFAULT '{}',
        bot_controls_roles TEXT[] DEFAULT '{}',
        max_duration_seconds INTEGER DEFAULT 900
      );

      CREATE TABLE IF NOT EXISTS guild_queues (
        guild_id TEXT PRIMARY KEY,
        now_playing JSONB,
        queue_items JSONB,
        history_items JSONB,
        lazy_load_queue JSONB DEFAULT '[]',
        current_playlist JSONB,
        volume JSONB DEFAULT '100',
        is_muted BOOLEAN DEFAULT FALSE,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guild_gifs (
        guild_id TEXT PRIMARY KEY,
        gif_urls TEXT[] DEFAULT '{}',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create the new audio metadata table
    try {
        await createAudioMetadataTable();
        console.log('Audio metadata table created successfully');
    } catch (error) {
        console.log('Audio metadata table creation check completed (table may already exist)');
    }
    
    // Add migration to add new columns to existing guild_settings table
    try {
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS slash_commands_access TEXT DEFAULT 'server_owner'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS components_access TEXT DEFAULT 'server_owner'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS bot_controls_access TEXT DEFAULT 'server_owner'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS slash_commands_roles TEXT[] DEFAULT '{}'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS components_roles TEXT[] DEFAULT '{}'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS bot_controls_roles TEXT[] DEFAULT '{}'
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS max_duration_seconds INTEGER DEFAULT 900
        `);
        await pool.query(`
            ALTER TABLE guild_settings 
            ADD COLUMN IF NOT EXISTS voice_timeout_minutes INTEGER DEFAULT 1
        `);
        console.log('Database migration completed successfully');
    } catch (error) {
        console.log('Database migration check completed (columns may already exist)');
    }
    
    // Add migration to add guild_gifs table if it doesn't exist
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_gifs (
                guild_id TEXT PRIMARY KEY,
                gif_urls TEXT[] DEFAULT '{}',
                use_custom_gifs BOOLEAN DEFAULT FALSE,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Guild GIFs table migration completed successfully');
    } catch (error) {
        console.log('Guild GIFs table migration check completed (table may already exist)');
    }
    
    // Add migration to add use_custom_gifs column if it doesn't exist
    try {
        await pool.query(`
            ALTER TABLE guild_gifs 
            ADD COLUMN IF NOT EXISTS use_custom_gifs BOOLEAN DEFAULT FALSE
        `);
        console.log('Guild GIFs use_custom_gifs column migration completed successfully');
    } catch (error) {
        console.log('Guild GIFs use_custom_gifs column migration check completed (column may already exist)');
    }
    
    // Add migration to add new columns to existing guild_queues table
    try {
        await pool.query(`
            ALTER TABLE guild_queues 
            ADD COLUMN IF NOT EXISTS lazy_load_queue JSONB DEFAULT '[]'
        `);
        await pool.query(`
            ALTER TABLE guild_queues 
            ADD COLUMN IF NOT EXISTS current_playlist JSONB
        `);
        await pool.query(`
            ALTER TABLE guild_queues 
            ADD COLUMN IF NOT EXISTS volume JSONB DEFAULT '100'
        `);
        await pool.query(`
            ALTER TABLE guild_queues 
            ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE
        `);
        console.log('Guild queues table migration completed successfully');
    } catch (error) {
        console.log('Guild queues table migration check completed (columns may already exist)');
    }
}

export async function initDatabase() {
    try {
        console.log('Attempting to connect to PostgreSQL...');
        console.log('Database environment variables:');
        console.log('POSTGRES_HOST:', process.env.POSTGRES_HOST);
        console.log('POSTGRES_PORT:', process.env.POSTGRES_PORT);
        console.log('POSTGRES_DB:', process.env.POSTGRES_DB);
        console.log('POSTGRES_USER:', process.env.POSTGRES_USER);
        console.log('POSTGRES_PASSWORD:', process.env.POSTGRES_PASSWORD ? '[SET]' : '[NOT SET]');
        
        if (!pool) {
            // Dynamic pooling based on guild count and load
            const guildCount = process.env.GUILD_COUNT ? parseInt(process.env.GUILD_COUNT) : 10;
            const maxConnections = Math.min(Math.max(guildCount * 2, 5), 20); // 2 per guild, min 5, max 20
            const minConnections = Math.min(Math.max(guildCount, 2), 5); // 1 per guild, min 2, max 5
            
            pool = new Pool({
                host: process.env.POSTGRES_HOST || 'localhost',
                port: parseInt(process.env.POSTGRES_PORT || '5432'),
                database: process.env.POSTGRES_DB || 'postgres',
                user: process.env.POSTGRES_USER || 'postgres',
                password: process.env.POSTGRES_PASSWORD || 'postgres',
                max: maxConnections,
                min: minConnections,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                // Dynamic connection management
                allowExitOnIdle: false,
                // Connection validation
                application_name: 'discord-music-bot'
            });
            
            console.log(`[Database] Dynamic pool created: max=${maxConnections}, min=${minConnections} for ${guildCount} guilds`);
        }
        await pool.query('SELECT NOW()');
        console.log('Successfully connected to PostgreSQL');
        await createTables();
        return true;
    } catch (error) {
        console.error('Database connection error:', error);
        return false;
    }
}

export function getPool() {
    if (!pool) {
        throw new Error('Database pool has not been initialized. Call initDatabase() first.');
    }
    return pool;
}