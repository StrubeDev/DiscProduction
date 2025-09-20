import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { applyVolumeToSession } from '../handlers/common/audio-session.js';

export async function handleMuteCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.player) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently playing that can be muted.',
                flags: 64 // Ephemeral
            },
        });
    }

    // Toggle mute state
    if (!session.isMuted) {
        // Store current volume and mute
        session.previousVolume = session.volume || 100;
        
        console.log(`[Mute] Audio muted for guild ${guildId} (previous volume: ${session.previousVolume}%)`);
        
        // Apply mute to session and audio resource
        const success = await applyVolumeToSession(guildId, 0, true, _djsClient);
        
        // REMOVED: UI update handled by queue change event to prevent duplicates

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `🔇 Audio **muted** (previous volume: ${session.previousVolume}%)`,
                flags: 64,
            },
        });
    } else {
        // Unmute and restore previous volume
        const previousVolume = session.previousVolume || 100;
        
        console.log(`[Mute] Audio unmuted for guild ${guildId} (volume restored to: ${previousVolume}%)`);
        
        // Apply unmute to session and audio resource
        const success = await applyVolumeToSession(guildId, previousVolume, false, _djsClient);
        
        // Update the embed immediately to show the unmute status
        // REMOVED: UI update handled by queue change event to prevent duplicates
        
        // Clean up previous volume reference
        delete session.previousVolume;

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `🔊 Audio **unmuted** (volume: ${previousVolume}%)`,
                flags: 64,
            },
        });
    }
}
