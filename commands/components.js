// commands/components.js
import {
  InteractionResponseType,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import fetch from 'node-fetch';
import { cleanupOldPanel, createNewPanel } from '../components/panels/panelManager.js';
import { rateLimitCheck } from '../middleware/rate-limiting-middleware.js';
import { guildAudioSessions } from '../utils/core/audio-state.js';
import { getRandomGuildGif } from '../utils/database/guildGifs.js';

// Helper function to randomly select a gif URL from guild-specific collection
async function getRandomGif(guildId) {
  try {
    const gifUrl = await getRandomGuildGif(guildId);
    if (gifUrl) {
      return gifUrl;
    } else {
      // If custom mode is enabled but no custom GIFs exist, return null
      // This will be handled by the calling function
      return null;
    }
  } catch (error) {
    console.error(`Error getting random GIF for guild ${guildId}:`, error);
    // NO FALLBACK - if there's an error, return null to maintain strict custom mode
    return null;
  }
}

export async function getMainMenuMessageData(guildId) {
  const gifUrl = await getRandomGif(guildId);
  
  // Build the embed - only include image if a GIF is available
  const embed = {
    color: 0x506098,
  };
  
  if (gifUrl) {
    embed.image = { url: gifUrl };
  } else {
    // If no GIF is available (custom mode enabled but no custom GIFs), add a message
    embed.description = "🎯 **Custom GIF mode enabled** - No custom GIFs available. Add some GIFs in the Admin Panel to see them here!";
  }
  
  return {
    embeds: [embed],
    components: [
      {
        type: MessageComponentTypes.ACTION_ROW,
        components: [
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'open_add_song_modal', // Changed from menu_nav_playback_controls
            label: 'Add Song +',
            style: ButtonStyleTypes.SECONDARY,
            
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_playback',
            label: 'Playback',
            style: ButtonStyleTypes.SECONDARY,
            
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_queue_history',
            label: 'Queue',
            style: ButtonStyleTypes.SECONDARY,
           
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_features',
            label: 'Tools',
            style: ButtonStyleTypes.SECONDARY,
           
          },
        ],
      },
    ],
  };
}

// Add a new function to get main menu with Giphy image
export async function getMainMenuMessageDataWithThumbnail(guildId) {
  const gifUrl = await getRandomGif(guildId);
  
  // Build the embed - only include image if a GIF is available
  const embed = {
    color: 0x506098,
  };
  
  if (gifUrl) {
    embed.image = { url: gifUrl };
  } else {
    // If no GIF is available (custom mode enabled but no custom GIFs), add a message
    embed.description = "🎯 **Custom GIF mode enabled** - No custom GIFs available. Add some GIFs in the Admin Panel to see them here!";
  }
  
  return {
    embeds: [embed],
    components: [
      {
        type: MessageComponentTypes.ACTION_ROW,
        components: [
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'open_add_song_modal', // Changed from menu_nav_playback_controls
            label: 'Add Song',
            style: ButtonStyleTypes.SECONDARY,
           
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_playback',
            label: 'Playback',
            style: ButtonStyleTypes.SECONDARY,
           
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_queue_history',
            label: 'Queue',
            style: ButtonStyleTypes.SECONDARY,
           
          },
          {
            type: MessageComponentTypes.BUTTON,
            custom_id: 'menu_nav_features',
            label: 'Tools',
            style: ButtonStyleTypes.SECONDARY,
         
          },
        ],
      },
    ],
  };
}

export async function handleComponentsCommand(req, res, client) {
  const {
    guild_id: guildId,
    channel_id: currentChannelId,
    application_id: appId,
    token: interactionToken,
    member,
  } = req.body;

  const username = member?.user?.username || 'Unknown User';

  if (!guildId) {
    console.warn(`[${new Date().toISOString()}] /components command used by ${username} outside of a server (guild).`);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'This command can only be used within a server.',
        flags: 64 // Ephemeral message
      }
    });
  }

  // Add rate limiting check
  if (!await rateLimitCheck(guildId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Please wait a few seconds before creating another panel.',
        flags: 64 // Ephemeral message
      }
    });
  }

  try {
    // Enforce single components message per guild: delete any existing message before creating new
    try {
      const { MessageReferenceManager, MESSAGE_TYPES } = await import('../message/reference-managers.js');
      const existingRef = await MessageReferenceManager.getMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
      if (existingRef) {
        try {
          const channel = await client.channels.fetch(existingRef.channelId);
          if (channel && channel.isTextBased()) {
            const oldMsg = await channel.messages.fetch(existingRef.messageId).catch(() => null);
            if (oldMsg) {
              await oldMsg.delete().catch(() => {});
              console.log(`[Components] Deleted existing components message for guild ${guildId}`);
            }
          }
        } catch (e) {
          console.log(`[Components] Could not validate/delete old components message:`, e.message);
        }
        await MessageReferenceManager.clearMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS);
      }
    } catch (e) {
      console.log(`[Components] Single-message enforcement check failed:`, e.message);
    }

    res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    const menuData = await getMainMenuMessageData(guildId);
    const followupResponse = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`, {
      method: 'POST',
      body: JSON.stringify(menuData),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!followupResponse.ok) {
      throw new Error(`Failed to create panel: ${followupResponse.status}`);
    }

    const newMessage = await followupResponse.json();
    // Replace the old panel creation code with the new function
    await createNewPanel(guildId, currentChannelId, newMessage.id);
    
    // Store the message reference using MessageReferenceManager
    try {
      const { MessageReferenceManager, MESSAGE_TYPES } = await import('../message/reference-managers.js');
      await MessageReferenceManager.storeMessageRef(guildId, MESSAGE_TYPES.PLAYBACK_CONTROLS, newMessage.id, currentChannelId);
      console.log(`[Components] Stored playback controls message reference for guild ${guildId}: ${newMessage.id}`);
    } catch (error) {
      console.warn(`[Components] Error storing message reference for guild ${guildId}:`, error.message);
    }

  } catch (error) {
    console.error(`Panel creation failed for guild ${guildId}:`, error);
    // Attempt to send error message to user
    try {
      await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: 'Failed to create the control panel. Please try again later.',
          flags: 64
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
}

