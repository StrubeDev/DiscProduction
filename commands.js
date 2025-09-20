import 'dotenv/config';
import { InstallGlobalCommands } from './utils/helpers/discord-api.js';

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};
// Command to trigger your component template
const COMPONENTS_COMMAND = {
  name: 'components',
  description: 'Showcase Discord component types',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// MODIFIED: Add SKIP_COMMAND definition
const SKIP_COMMAND = {
  name: 'skip',
  description: 'Skips the current song.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// MODIFIED: Add STOP_COMMAND definition (example)
const STOP_COMMAND = {
  name: 'stop',
  description: 'Stops all playback, clears the queue, and disconnects the bot.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};


const PLAY_COMMAND = {
  name: 'play',
  description: 'Play a song from YouTube',
  options: [
    {
      name: 'query',
      description: 'Song name or YouTube URL (use this OR song + artist)',
      type: 3, // STRING
      required: false,
    },
    {
      name: 'song',
      description: 'Song name (use with artist option)',
      type: 3, // STRING
      required: false,
    },
    {
      name: 'artist',
      description: 'Artist name (use with song option)',
      type: 3, // STRING
      required: false,
    },
  ],
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const PAUSE_COMMAND = {
  name: 'pause',
  description: 'Pauses the current song.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const RESUME_COMMAND = {
  name: 'resume',
  description: 'Resumes a paused song.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SHUFFLE_COMMAND = {
  name: 'shuffle',
  description: 'Shuffles the current queue.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const RESET_COMMAND = {
  name: 'reset',
  description: 'Completely resets the bot state for this guild (admin only).',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VOLUME_UP_COMMAND = {
  name: 'volumeup',
  description: 'Increases the volume by 10%.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VOLUME_DOWN_COMMAND = {
  name: 'volumedown',
  description: 'Decreases the volume by 10%.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const MUTE_COMMAND = {
  name: 'mute',
  description: 'Toggles mute on/off for the current audio.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VOLUME_TEST_COMMAND = {
  name: 'volumetest',
  description: 'Debug volume control issues.',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AUTO_ADVANCE_COMMAND = {
  name: 'auto-advance',
  description: 'Control whether the bot automatically plays the next song in queue',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [
  ...(process.env.ENABLE_TEST_COMMAND === 'true' ? [TEST_COMMAND] : []),
  COMPONENTS_COMMAND,
  PLAY_COMMAND, // Add PLAY_COMMAND back
  SKIP_COMMAND,
  STOP_COMMAND,
  PAUSE_COMMAND,
  RESUME_COMMAND,
  SHUFFLE_COMMAND,
  RESET_COMMAND,
  VOLUME_UP_COMMAND,
  VOLUME_DOWN_COMMAND,
  MUTE_COMMAND,
  VOLUME_TEST_COMMAND,
  AUTO_ADVANCE_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);