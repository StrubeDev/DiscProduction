import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { applyVolumeToSession } from '../handlers/common/audio-session.js';

export async function handleVolumeDownCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.player) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently playing that can have its volume adjusted.',
                flags: 64 // Ephemeral
            },
        });
    }

    // Decrease volume by 10% (min 0%)
    const currentVolume = session.volume || 100;
    const newVolume = Math.max(0, currentVolume - 10);
    
    console.log(`[VolumeDown] Volume decreased to ${newVolume}% for guild ${guildId}`);
    
    // Apply volume to session and audio resource
    console.log(`[VolumeDown] About to apply volume ${newVolume}% to session for guild ${guildId}`);
    console.log(`[VolumeDown] Current player status: ${session.player.state.status}`);
    console.log(`[VolumeDown] Current resource: ${session.player.state.resource ? 'Available' : 'None'}`);
    
    const success = await applyVolumeToSession(guildId, newVolume, false, _djsClient);
    console.log(`[VolumeDown] Volume application result: ${success}`);
    
    // Update the embed immediately to show the new volume
    try {
        const { updatePlaybackControlsEmbed } = await import('../handlers/menu-component-handlers.js');
        await updatePlaybackControlsEmbed(guildId, _djsClient, session);
        console.log(`[VolumeDown] Updated playback controls embed for guild ${guildId}`);
    } catch (error) {
        console.error(`[VolumeDown] Error updating embed: ${error.message}`);
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `🔉 Volume decreased to **${newVolume}%**`,
            flags: 64,
        },
    });
}
