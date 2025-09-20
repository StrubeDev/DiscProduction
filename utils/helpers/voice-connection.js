import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';

export async function getOrCreateVoiceConnection(guild, member) {
    let connection = getVoiceConnection(guild.id);
    
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        const discordMember = await guild.members.fetch(member.user.id);
        const voiceChannel = discordMember.voice.channel;
        
        if (!voiceChannel) {
            throw new Error('User must be in a voice channel');
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        // Add connection error handling
        connection.on('error', error => {
            console.error(`[VoiceConnection] Error in guild ${guild.id}:`, error);
        });
    }

    return connection;
}
