// commands/play.js
import {
    createAudioResource,
    StreamType,
    AudioPlayerStatus,
} from '@discordjs/voice';

// Import yt-dlp-wrap - handle nested default export
import { default as ytDlpModule } from 'yt-dlp-wrap';
const YTDlpWrap = ytDlpModule.default;

import { updatePersistentQueueMessage } from '../utils/helpers/message-helpers.js';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import EventEmitter from 'events';
import { guildAudioSessions } from '../utils/core/audio-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const possiblePaths = [
    path.join(projectRoot, 'yt-dlp', 'yt-dlp.exe'),
    path.join(projectRoot, 'yt-dlp', 'yt-dlp'),
    path.join(projectRoot, 'yt-dlp.exe'),
    '/usr/bin/yt-dlp', // Docker system path
    '/usr/local/bin/yt-dlp', // Alternative Docker path
    'yt-dlp' // System PATH
];

let ytDlpBinaryPath = null;
for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
        ytDlpBinaryPath = testPath;
        console.log(`[PlayCmd] Found yt-dlp binary at: ${testPath}`);
        break;
    }
}

if (!ytDlpBinaryPath) {
    console.error('[PlayCmd] yt-dlp binary not found in any expected location. Searched paths:', possiblePaths);
    throw new Error('yt-dlp binary not found');
}
console.log(`[PlayCmd] Using yt-dlp binary at: ${ytDlpBinaryPath}`);

export let ytDlpWrap;
try {
    ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);
    console.log('[PlayCmd] YTDlpWrap initialized successfully and aggressively patched to prevent crashes');
    
    // Global error handler as last resort
    ytDlpWrap.on('error', (error) => {
        console.error('[PlayCmd] Global yt-dlp-wrap error handler caught:', error);
    });
    
    console.log('[PlayCmd] Global yt-dlp-wrap error handler installed as last resort');
} catch (error) {
    console.error('[PlayCmd] Failed to initialize YTDlpWrap:', error);
    throw error;
}

// Track active queries to prevent duplicates
const activeQueries = new Map(); // guildId -> query

/**
 * Get audio stream details quickly using yt-dlp
 * This is a utility function for fast metadata extraction
 */
export async function getAudioStreamDetailsFast(originalQuery, titleFallback, guildId) {
    console.log(`[PlayCmd] Getting audio stream details for: "${originalQuery}"`);
    
    // Check for duplicate queries
    if (activeQueries.has(guildId)) {
        console.log(`[PlayCmd] Query already active for guild ${guildId}, skipping duplicate`);
        return null;
    }
    
    // Mark query as active
    activeQueries.set(guildId, originalQuery);
    
    try {
        // Note: Duration limit check will be handled by the unified service
        // when the actual video duration is known
        
        // Get metadata using yt-dlp
        const metadata = await ytDlpWrap.getVideoInfo(originalQuery);
        
        if (!metadata) {
            console.log(`[PlayCmd] No metadata found for: "${originalQuery}"`);
            return { error: 'No metadata found' };
        }
        
        console.log(`[PlayCmd] ✅ Got metadata for: "${metadata.title || titleFallback}"`);
        
        return {
            title: metadata.title || titleFallback,
            duration: metadata.duration || 0,
            thumbnail: metadata.thumbnail || null,
            url: metadata.webpage_url || originalQuery
        };
        
    } catch (error) {
        console.error(`[PlayCmd] Error getting stream details:`, error);
        return { error: error.message };
    } finally {
        // Remove from active queries
        if (activeQueries.has(guildId)) {
            activeQueries.delete(guildId);
        }
    }
}

/**
 * Clean up guild command data
 */
export function cleanupGuildCommandData(guildId) {
    console.log(`[PlayCmd] Cleaning up command data for guild ${guildId}`);
    
    // Remove from active queries
    if (activeQueries.has(guildId)) {
        activeQueries.delete(guildId);
    }
}

/**
 * Clean up old command data
 */
export function cleanupOldCommandData() {
    console.log(`[PlayCmd] Cleaning up old command data`);
    
    // Clear active queries map
    activeQueries.clear();
}
