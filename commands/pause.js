import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js'; // Import the session manager
import { AudioPlayerStatus } from '@discordjs/voice'; // Import status for checks

export async function handlePauseCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.player || session.player.state.status !== AudioPlayerStatus.Playing) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently playing that can be paused.',
                flags: 64 // Ephemeral
            },
        });
    }

    const success = session.player.pause();
    
    // UPDATE PLAYBACK CONTROLS EMBED when playback is paused
    if (success) {
        try {
            const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
            await updatePlaybackControlsEmbed(guildId, _djsClient, session);
        } catch (error) {
            console.error('[PauseCommand] Error updating playback controls embed:', error.message);
        }
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: success ? '⏸️ Playback paused.' : '❌ Failed to pause playback.',
        },
    });
}

export async function handleResumeCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.player || session.player.state.status !== AudioPlayerStatus.Paused) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently paused that can be resumed.',
                flags: 64 // Ephemeral
            },
        });
    }

    const success = session.player.unpause();
    
    // UPDATE PLAYBACK CONTROLS EMBED when playback is resumed
    if (success) {
        try {
            const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
            await updatePlaybackControlsEmbed(guildId, _djsClient, session);
        } catch (error) {
            console.error('[ResumeCommand] Error updating playback controls embed:', error.message);
        }
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: success ? '▶️ Playback resumed.' : '❌ Failed to resume playback.',
        },
    });
}