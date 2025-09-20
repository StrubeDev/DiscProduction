import { InteractionResponseType } from 'discord-interactions';
import { guildAudioSessions } from '../utils/core/audio-state.js';

export async function handleVolumeTestCommand(req, res, _djsClient) {
    const guildId = req.body.guild_id;
    const session = guildAudioSessions.get(guildId);

    if (!session || !session.player) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Nothing is currently playing that can be tested.',
                flags: 64 // Ephemeral
            },
        });
    }

    let debugInfo = `**Volume Test Results for Guild ${guildId}**\n\n`;
    
    // Check session volume
    debugInfo += `**Session Volume:** ${session.volume || 100}%\n`;
    debugInfo += `**Session Muted:** ${session.isMuted || false}\n\n`;
    
    // Check player state
    debugInfo += `**Player Status:** ${session.player.state.status}\n`;
    
    // Check current resource
    const currentResource = session.player.state.resource;
    if (currentResource) {
        debugInfo += `**Audio Resource:** Available\n`;
        debugInfo += `**Resource Type:** ${currentResource.constructor.name}\n`;
        debugInfo += `**Resource Properties:** ${Object.keys(currentResource).join(', ')}\n`;
        
        // Check volume control availability
        if (currentResource.volume) {
            debugInfo += `**Volume Property:** Available\n`;
            if (typeof currentResource.volume.setVolume === 'function') {
                debugInfo += `**setVolume Method:** Available\n`;
                
                // Try to get current volume
                try {
                    const currentVolume = currentResource.volume.volume;
                    debugInfo += `**Current Volume Scale:** ${currentVolume}\n`;
                } catch (error) {
                    debugInfo += `**Error getting current volume:** ${error.message}\n`;
                }
            } else {
                debugInfo += `**setVolume Method:** Not available\n`;
            }
        } else {
            debugInfo += `**Volume Property:** Not available\n`;
        }
        
        // Check if setVolume is directly on the resource
        if (typeof currentResource.setVolume === 'function') {
            debugInfo += `**Direct setVolume Method:** Available\n`;
        } else {
            debugInfo += `**Direct setVolume Method:** Not available\n`;
        }
    } else {
        debugInfo += `**Audio Resource:** Not available\n`;
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: debugInfo,
            flags: 64,
        },
    });
}
