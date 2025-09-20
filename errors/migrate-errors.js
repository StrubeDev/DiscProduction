#!/usr/bin/env node
// errors/migrate-errors.js
// Script to help migrate hardcoded errors to the new error system

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common error patterns to replace
const errorPatterns = [
    {
        pattern: /throw new Error\(['"`]([^'"`]+)['"`]\)/g,
        replacement: (match, message) => {
            // Map common messages to error codes
            const messageMap = {
                'Failed to fetch Spotify track details': 'throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_GET_VIDEO_INFO)',
                'No active audio session found': 'throwError.session(ErrorCodes.SESSION.NO_ACTIVE_SESSION)',
                'Invalid Spotify track URL': 'throwError.validation(ErrorCodes.VALIDATION.INVALID_SPOTIFY_URL)',
                'Duration limit exceeded': 'throwError.media(ErrorCodes.MEDIA_PROCESSING.DURATION_LIMIT_EXCEEDED)',
                'Video unavailable or restricted': 'throwError.media(ErrorCodes.MEDIA_PROCESSING.VIDEO_UNAVAILABLE)',
                'Failed to process media content': 'throwError.media(ErrorCodes.MEDIA_PROCESSING.FAILED_TO_PROCESS)',
                'Unknown media type': 'throwError.validation(ErrorCodes.VALIDATION.INVALID_QUERY)'
            };
            
            return messageMap[message] || `throwError.generic('UNKNOWN_ERROR', { message: '${message}' })`;
        }
    },
    {
        pattern: /console\.error\([^)]*Error[^)]*\)/g,
        replacement: 'errorHandler.handleError(error, { guildId, context })'
    },
    {
        pattern: /sendErrorMessage\([^,]+,\s*`[^`]*\$\{[^}]+\}[^`]*`\)/g,
        replacement: 'sendErrorMessage(interactionDetails, MessageFormatters.forUser(error, { songTitle }))'
    }
];

// Files to migrate (relative to project root)
const filesToMigrate = [
    'handlers/media/spotify-playlist.js',
    'handlers/media/youtube-playlist.js',
    'handlers/common/audio-session.js',
    'utils/processors/unified-ytdlp-service.js',
    'utils/services/queue-manager.js',
    'utils/services/cleanup-service.js',
    'handlers/core/player.js',
    'routers/query-router.js'
];

function addErrorImports(content) {
    const importLine = "import { createError, throwError, ErrorCodes, MessageFormatters, errorHandler } from '../../errors/index.js';";
    
    // Check if already imported
    if (content.includes('from \'../../errors/index.js\'')) {
        return content;
    }
    
    // Add import after other imports
    const lines = content.split('\n');
    let insertIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') || lines[i].startsWith('const ') && lines[i].includes('require(')) {
            insertIndex = i + 1;
        } else if (lines[i].trim() === '') {
            continue;
        } else {
            break;
        }
    }
    
    lines.splice(insertIndex, 0, importLine);
    return lines.join('\n');
}

function migrateFile(filePath) {
    try {
        const fullPath = path.join(process.cwd(), filePath);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  File not found: ${filePath}`);
            return;
        }
        
        let content = fs.readFileSync(fullPath, 'utf8');
        let modified = false;
        
        // Add error imports
        const newContent = addErrorImports(content);
        if (newContent !== content) {
            content = newContent;
            modified = true;
        }
        
        // Apply error pattern replacements
        for (const { pattern, replacement } of errorPatterns) {
            const newContent = content.replace(pattern, replacement);
            if (newContent !== content) {
                content = newContent;
                modified = true;
            }
        }
        
        if (modified) {
            fs.writeFileSync(fullPath, content);
            console.log(`✅ Migrated: ${filePath}`);
        } else {
            console.log(`ℹ️  No changes needed: ${filePath}`);
        }
        
    } catch (error) {
        console.error(`❌ Error migrating ${filePath}:`, error.message);
    }
}

function main() {
    console.log('🚀 Starting error system migration...\n');
    
    filesToMigrate.forEach(migrateFile);
    
    console.log('\n✨ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Review the changes made');
    console.log('2. Test the error handling');
    console.log('3. Update any remaining hardcoded errors manually');
    console.log('4. Run the bot to verify everything works');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { migrateFile, addErrorImports };
