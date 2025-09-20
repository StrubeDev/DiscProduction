/**
 * Application service for startup orchestration
 */
import express from 'express';
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from 'discord-interactions';
import { EnvironmentValidator } from '../config/environment.js';
import { CommandRegistry } from '../handlers/registry/command-registry.js';
import { ComponentRegistry } from '../handlers/registry/component-registry.js';
import { DatabaseService } from './database-service.js';
import { ClientService } from './client-service.js';

export class ApplicationService {
  static async start(client) {
    try {
      console.log('[APPLICATION] Starting application services...');
      
      // Register client in the service
      ClientService.setClient(client);
      
      // Validate environment
      if (!EnvironmentValidator.validate()) {
        throw new Error('Environment validation failed');
      }

      // Initialize handlers (no need to pass client anymore)
      const commandHandlers = await CommandRegistry.registerAll();
      const { messageComponentHandlers, modalSubmitHandlers } = await ComponentRegistry.registerAll();

      // Initialize database
      const dbInitialized = await DatabaseService.initialize();
      if (dbInitialized) {
        await DatabaseService.loadGuildQueueDisplayPreferences(ClientService.getClient());
      }

      // Set up voice channel checks
      await this.setupVoiceChannelChecks();

      // Create and configure Express app
      const app = this.createExpressApp(commandHandlers, messageComponentHandlers, modalSubmitHandlers);
      
      // Start server
      const port = EnvironmentValidator.getPort();
      app.listen(port, () => {
        console.log(`[APPLICATION] Express server listening on port ${port}`);
        console.log('[APPLICATION] Application startup completed successfully');
      });

      return app;
    } catch (error) {
      console.error('[APPLICATION] Failed to start application:', error);
      throw error;
    }
  }

  static createExpressApp(commandHandlers, messageComponentHandlers, modalSubmitHandlers) {
    const app = express();

    app.post('/interactions', verifyKeyMiddleware(EnvironmentValidator.getPublicKey()), async (req, res) => {
      const interactionId = req.body.id;
      const interactionType = req.body.type;
      const commandName = (interactionType === InteractionType.APPLICATION_COMMAND) ? req.body.data.name : 'N/A';

      console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Type: ${interactionType} | Cmd: ${commandName} | Interaction received by /interactions endpoint.`);

      const { type, data } = req.body;

      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      try {
        if (type === InteractionType.APPLICATION_COMMAND) {
          const handler = commandHandlers[data.name];
          if (handler) {
            console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Cmd: ${data.name} | Dispatching to command handler.`);
            return handler(req, res, ClientService.getClient());
          }
        } else if (type === InteractionType.MESSAGE_COMPONENT) {
          console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | MESSAGE_COMPONENT interaction received. Full body:`, JSON.stringify(req.body, null, 2));
          const handler = messageComponentHandlers[data.custom_id];
          if (handler) {
            console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Component: ${data.custom_id} | Dispatching to component handler.`);
            return handler(req, res, data, ClientService.getClient());
          } else {
            console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Component: ${data.custom_id} | No handler found. Available handlers:`, Object.keys(messageComponentHandlers));
          }
        } else if (type === InteractionType.MODAL_SUBMIT) {
          console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | MODAL_SUBMIT interaction received. Full body:`, JSON.stringify(req.body, null, 2));
          const handler = modalSubmitHandlers[data.custom_id];
          if (handler) {
            console.log(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Modal: ${data.custom_id} | Dispatching to modal handler.`);
            return handler(req, res, data, ClientService.getClient());
          } else {
            console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Modal: ${data.custom_id} | No handler found. Available handlers:`, Object.keys(modalSubmitHandlers));
          }
        }
        console.warn(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Unknown or unhandled interaction type/custom_id:`, req.body);
        return res.status(404).send({ error: 'Unknown interaction' });
      } catch (error) {
        console.error(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Error handling interaction:`, error);
        try {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "An error occurred while processing your request.", flags: 64 }
          });
        } catch (e) {
          console.error(new Date().toISOString(), `[APP_DEBUG] ID: ${interactionId} | Failed to send error response for interaction:`, e);
        }
      }
    });

    return app;
  }

  static async setupVoiceChannelChecks() {
    // Set up periodic voice channel checks for timeout management
    const { checkAllVoiceChannels } = await import('../handlers/menu-component-handlers.js');
    let voiceCheckInterval = null;
    
    const startVoiceChecks = () => {
      if (voiceCheckInterval) return; // Already running
      // DISABLED: Voice checks are now event-driven in bot.js
      // No need for periodic polling since we listen to AudioPlayer state changes
      console.log('[VOICE_CHECK] Voice checks are now event-driven - no periodic polling needed');
    };
    
    const stopVoiceChecks = () => {
      if (voiceCheckInterval) {
        clearInterval(voiceCheckInterval);
        voiceCheckInterval = null;
        console.log('[VOICE_CHECK] Stopped periodic voice channel checks');
      }
    };
    
    // Start with initial check
    startVoiceChecks();
    
    // Export these functions so they can be used elsewhere
    global.startVoiceChecks = startVoiceChecks;
    global.stopVoiceChecks = stopVoiceChecks;
  }
}
