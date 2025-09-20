import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { enableAutoAdvance, disableAutoAdvance, getAutoAdvanceStatus } from '../utils/services/auto-advance-service.js';

export const data = new SlashCommandBuilder()
    .setName('auto-advance')
    .setDescription('Control whether the bot automatically plays the next song in queue')
    .addSubcommand(subcommand =>
        subcommand
            .setName('enable')
            .setDescription('Enable automatic queue progression')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('disable')
            .setDescription('Disable automatic queue progression')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Check current auto-advance status')
    );

export async function execute(interaction) {
    const { guildId } = interaction;
    
    if (!guildId) {
        return await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    }

    const session = guildAudioSessions.get(guildId);
    if (!session) {
        return await interaction.reply({ content: '❌ No active music session found!', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'enable':
            enableAutoAdvance(guildId, session);
            await interaction.reply({ 
                content: '✅ **Auto-advance enabled!** The bot will now automatically play the next song when one ends.', 
                ephemeral: true 
            });
            break;

        case 'disable':
            disableAutoAdvance(guildId, session);
            await interaction.reply({ 
                content: '⏹️ **Auto-advance disabled!** The bot will stop after each song and wait for your command.', 
                ephemeral: true 
            });
            break;

        case 'status':
            const status = getAutoAdvanceStatus(guildId, session);
            const statusText = status.enabled ? 'enabled' : 'disabled';
            const statusEmoji = status.enabled ? '✅' : '⏹️';
            const queueInfo = status.hasQueue ? `\n\nQueue: ${status.queueLength} song${status.queueLength === 1 ? '' : 's'} waiting` : '\n\nQueue: Empty';
            const advancingInfo = status.isAdvancing ? '\n\n🔄 Currently advancing to next song...' : '';
            
            await interaction.reply({ 
                content: `${statusEmoji} **Auto-advance is currently ${statusText}.**${queueInfo}${advancingInfo}\n\nWhen ${statusText === 'enabled' ? 'enabled' : 'disabled'}, the bot will ${statusText === 'enabled' ? 'automatically play the next song' : 'stop after each song and wait for your command'}.`, 
                ephemeral: true 
            });
            break;

        default:
            await interaction.reply({ content: '❌ Invalid subcommand!', ephemeral: true });
    }
}
