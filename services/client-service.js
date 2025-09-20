/**
 * Client service for managing Discord client instance
 * Centralizes client access across the application
 */
export class ClientService {
  static client = null;

  /**
   * Set the Discord client instance
   * @param {Client} client - Discord.js client instance
   */
  static setClient(client) {
    this.client = client;
    console.log('[CLIENT_SERVICE] Discord client registered successfully');
  }

  /**
   * Get the Discord client instance
   * @returns {Client} Discord.js client instance
   */
  static getClient() {
    if (!this.client) {
      throw new Error('[CLIENT_SERVICE] Client not initialized. Call setClient() first.');
    }
    return this.client;
  }

  /**
   * Check if client is available
   * @returns {boolean} True if client is set
   */
  static isClientAvailable() {
    return this.client !== null;
  }

  /**
   * Get client info for logging
   * @returns {Object} Client information
   */
  static getClientInfo() {
    if (!this.client) {
      return { available: false };
    }
    
    return {
      available: true,
      user: this.client.user?.username || 'Unknown',
      id: this.client.user?.id || 'Unknown',
      guilds: this.client.guilds?.cache?.size || 0,
      uptime: this.client.uptime || 0
    };
  }
}
