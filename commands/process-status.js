import { InteractionResponseType } from 'discord-interactions';

export async function handleProcessStatusCommand(req, res, _djsClient) {
    try {
        const { unifiedYtdlpService } = await import('../utils/unified-ytdlp-service.js');
        const status = unifiedYtdlpService.getProcessStatus();
        
        let response = `🔍 **Process Status Report**\n\n`;
        response += `📊 **Total Guilds:** ${status.totalGuilds}\n`;
        response += `⚙️ **Total Processes:** ${status.totalProcesses}\n\n`;
        
        if (status.totalGuilds > 0) {
            response += `📋 **Guild Details:**\n`;
            for (const [guildId, details] of Object.entries(status.guildDetails)) {
                response += `• Guild ${guildId}: ${details.aliveProcesses}/${details.totalProcesses} alive processes`;
                if (details.processPids.length > 0) {
                    response += ` (PIDs: ${details.processPids.join(', ')})`;
                }
                response += `\n`;
            }
        } else {
            response += `✅ No active processes found`;
        }
        
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: response,
                flags: 64,
            },
        });
    } catch (error) {
        console.error('[ProcessStatus] Error getting process status:', error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error getting process status',
                flags: 64,
            },
        });
    }
}
