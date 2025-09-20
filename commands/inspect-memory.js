// commands/inspect-memory.js
import { InteractionResponseType } from 'discord-interactions';

export async function handleInspectMemoryCommand(req, res, djsClient) {
    const guildId = req.body.guild_id;
    
    try {
        console.log(`[InspectMemory] Manual memory inspection requested for guild ${guildId}`);
        
        // Import and run the inspection
        const { inspectAllMaps } = await import('../handlers/common/audio-session.js');
        await inspectAllMaps();
        
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '🔍 Memory inspection completed! Check the console logs for detailed Map information.',
                flags: 64,
            },
        });
    } catch (error) {
        console.error(`[InspectMemory] Error during inspection:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `❌ Error during memory inspection: ${error.message}`,
                flags: 64,
            },
        });
    }
}
