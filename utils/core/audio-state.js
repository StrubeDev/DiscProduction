export const guildAudioSessions = new Map();

// Helper function to get existing session without creating a new one
export function getExistingSession(guildId) {
    return guildAudioSessions.get(guildId);
}

// Helper function to check if session exists and is valid
export function hasValidSession(guildId) {
    const session = guildAudioSessions.get(guildId);
    return session && session.player && session.connection;
}
