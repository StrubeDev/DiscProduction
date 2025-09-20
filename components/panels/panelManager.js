import { getPanelInfo, setPanelInfo, deletePanelInfo } from '../../utils/database/panels.js';

export async function cleanupOldPanel(guildId, client) {
    const oldPanelInfo = await getPanelInfo(guildId);
    
    if (oldPanelInfo && oldPanelInfo.channelId && oldPanelInfo.messageId) {
        try {
            const channelToDeleteFrom = await client.channels.fetch(oldPanelInfo.channelId).catch(() => null);

            if (channelToDeleteFrom) {
                await channelToDeleteFrom.messages.delete(oldPanelInfo.messageId)
                    .catch(err => console.warn(`[PanelCleanup] Failed to delete old panel message: ${err.message}`));
            }
        } catch (error) {
            console.warn(`[PanelCleanup] A non-critical error occurred during old panel cleanup for guild ${guildId}: ${error.message}`);
        }
        await deletePanelInfo(guildId);
    }
}

export async function createNewPanel(guildId, channelId, messageId) {
    await setPanelInfo(guildId, {
        messageId: messageId,
        channelId: channelId,
        createdAt: new Date().toISOString()
    });
}