import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { cleanupService } from '../utils/services/cleanup-service.js';
import { AudioPlayerStatus } from '@discordjs/voice';
import { processManager } from '../utils/services/process-manager.js';

export async function handleSkipCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (
        !session ||
        !session.player ||
        (!session.nowPlaying) || // This is the key check to prevent errors
        (session.player.state.status !== AudioPlayerStatus.Playing &&
         session.player.state.status !== AudioPlayerStatus.Paused)
    ) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently playing or paused to skip.',
                flags: 64,
            },
        });
    }

    const skippedSongTitle = session.nowPlaying?.title || 'The current song';

    // FIXED: Set the error flag to false for manual skips so the next song will play
    session.currentSongEndedWithError = false;

    // CRITICAL: Clear preloaded data from the current song to prevent reuse
    if (session.nowPlaying) {
        console.log(`[Skip] 🧹 Clearing preloaded data from current song: "${session.nowPlaying.title}"`);
        
        // Clear from per-guild preloaded data storage
        const { preloader } = await import('../utils/services/preloader.js');
        preloader.cleanupSongPreloadedData(guildId, session.nowPlaying.query);
        
        // Clear from song object
        session.nowPlaying.preloadedTempFile = null;
        session.nowPlaying.preloadedMetadata = null;
        session.nowPlaying.preloadCompleted = false;
        session.nowPlaying.isPreloading = false;
    }

    // Use the EXACT SAME comprehensive cleanup process as when songs end naturally
    console.log(`[Skip] Using comprehensive cleanup process - same as natural song ending`);
    
    // Stop the player first to trigger the natural Idle event cleanup
    console.log(`[Skip] 🔍 DEBUG: Player state before stop: ${session.player.state.status}`);
    session.player.stop(true);
    console.log(`[Skip] 🔍 DEBUG: Player state after stop: ${session.player.state.status}`);
    
    // DEBUG: Test if player can transition to Idle
    setTimeout(() => {
        console.log(`[Skip] 🔍 DEBUG: Player state after 1 second: ${session.player.state.status}`);
    }, 1000);
    
    // The AudioPlayerStatus.Idle event will now handle:
    // - Essential cleanup
    // - Auto-advance to next song (if queue has songs)
    // - Comprehensive song object cleanup
    // - Memory tracking and Map cleanup
    // - All the same cleanup as natural song ending
    
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `⏭️ Skipped **${skippedSongTitle}**.`,
            flags: 64,
        },
    });
}
