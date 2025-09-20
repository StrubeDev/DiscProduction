import fetch from 'node-fetch';

/**
 * Installs global slash commands for the Discord bot
 * @param {string} appId - The Discord application ID
 * @param {Array} commands - Array of command objects to register
 */
export async function InstallGlobalCommands(appId, commands) {
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${process.env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to register commands:', error);
  } else {
    console.log('Commands registered successfully!');
  }
}

/**
 * Sends a followup message to a Discord interaction
 * @param {string} appId - The Discord application ID
 * @param {string} interactionToken - The interaction token
 * @param {Object} messageData - The message data to send
 * @returns {Promise<Object>} - The response data
 */
export async function sendFollowupMessage(appId, interactionToken, messageData) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send followup message: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Updates an interaction's original message
 * @param {string} appId - The Discord application ID
 * @param {string} interactionToken - The interaction token
 * @param {Object} messageData - The message data to update with
 * @returns {Promise<Object>} - The response data
 */
export async function updateOriginalMessage(appId, interactionToken, messageData) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update original message: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Updates a message via webhook (for queue processing messages)
 * @param {string} applicationId - The Discord application ID
 * @param {string} interactionToken - The interaction token
 * @param {Object} messageData - The message data to update with
 * @returns {Promise<Object>} - The response data
 */
export async function updateWebhookMessage(applicationId, interactionToken, messageData) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update webhook message: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Gets the Discord API base URL for the current API version
 * @param {number} version - The API version (default: 10)
 * @returns {string} - The base API URL
 */
export function getDiscordApiUrl(version = 10) {
  return `https://discord.com/api/v${version}`;
}

/**
 * Creates standard Discord API headers
 * @param {string} token - The bot token
 * @param {Object} additionalHeaders - Additional headers to include
 * @returns {Object} - The headers object
 */
export function createDiscordHeaders(token, additionalHeaders = {}) {
  return {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
    ...additionalHeaders
  };
}
