/**
 * Command handler registry
 */
import { ClientService } from '../../services/client-service.js';

export class CommandRegistry {
  static async registerAll() {
    const commandHandlers = {};

    // Register components command
    await this.registerCommand(commandHandlers, 'components', '../../commands/components.js', 'handleComponentsCommand');
    
    // Register play command
    await this.registerCommand(commandHandlers, 'play', '../core/play-command.js', 'handlePlayCommand');
    
    // Register stop command with mod permissions
    await this.registerCommandWithPermissions(commandHandlers, 'stop', '../../commands/stop.js', 'handleStopCommand', 'mod');
    
    // Register skip command with mod permissions
    await this.registerCommandWithPermissions(commandHandlers, 'skip', '../../commands/skip.js', 'handleSkipCommand', 'mod');
    
    // Register shuffle command with mod permissions
    await this.registerCommandWithPermissions(commandHandlers, 'shuffle', '../../commands/shuffle.js', 'handleShuffleCommand', 'mod');
    
    // Register reset command with admin permissions
    await this.registerCommandWithPermissions(commandHandlers, 'reset', '../../commands/reset.js', 'handleResetCommand', 'admin');
    
    // Register memory command
    await this.registerCommand(commandHandlers, 'memory', '../../commands/inspect-memory.js', 'handleInspectMemoryCommand');
    
    // Register volume commands with mod permissions
    await this.registerCommandWithPermissions(commandHandlers, 'volumeup', '../../commands/volume-up.js', 'handleVolumeUpCommand', 'mod');
    await this.registerCommandWithPermissions(commandHandlers, 'volumedown', '../../commands/volume-down.js', 'handleVolumeDownCommand', 'mod');
    await this.registerCommandWithPermissions(commandHandlers, 'volumetest', '../../commands/volume-test.js', 'handleVolumeTestCommand', 'mod');
    
    // Register mute command with mod permissions
    await this.registerCommandWithPermissions(commandHandlers, 'mute', '../../commands/mute.js', 'handleMuteCommand', 'mod');
    
    // Register pause/resume commands with mod permissions
    await this.registerPauseResumeCommands(commandHandlers);

    console.log('[COMMAND_REGISTRY] Initialized Command Handlers:');
    console.log('[COMMAND_REGISTRY] Commands:', Object.keys(commandHandlers));
    
    return commandHandlers;
  }

  static async registerCommand(commandHandlers, commandName, modulePath, handlerName) {
    try {
      const module = await import(modulePath);
      if (module && typeof module[handlerName] === 'function') {
        commandHandlers[commandName] = (req, res) => module[handlerName](req, res, ClientService.getClient());
        console.log(`[COMMAND_REGISTRY] Successfully registered "${commandName}" command handler.`);
      } else {
        console.warn(`[COMMAND_REGISTRY] ${modulePath} did not export ${handlerName} correctly or is missing.`);
      }
    } catch (error) {
      console.error(`[COMMAND_REGISTRY] Failed to load "${commandName}" command handler:`, error);
    }
  }

  static async registerCommandWithPermissions(commandHandlers, commandName, modulePath, handlerName, permissionLevel) {
    try {
      const module = await import(modulePath);
      if (module && typeof module[handlerName] === 'function') {
        const { requireModPermissions, requireAdminPermissions } = await import('../../../middleware/permissionMiddleware.js');
        const permissionMiddleware = permissionLevel === 'admin' ? requireAdminPermissions : requireModPermissions;
        commandHandlers[commandName] = permissionMiddleware((req, res) => module[handlerName](req, res, ClientService.getClient()));
        console.log(`[COMMAND_REGISTRY] Successfully registered "${commandName}" command handler with ${permissionLevel} permissions.`);
      } else {
        console.warn(`[COMMAND_REGISTRY] ${modulePath} did not export ${handlerName} correctly or is missing.`);
      }
    } catch (error) {
      console.error(`[COMMAND_REGISTRY] Failed to load "${commandName}" command handler:`, error);
    }
  }

  static async registerPauseResumeCommands(commandHandlers) {
    try {
      const pauseCommandModule = await import('../../commands/pause.js');
      if (pauseCommandModule) {
        const { requireModPermissions } = await import('../../../middleware/permissionMiddleware.js');
        
        if (typeof pauseCommandModule.handlePauseCommand === 'function') {
          commandHandlers['pause'] = requireModPermissions((req, res) => pauseCommandModule.handlePauseCommand(req, res, ClientService.getClient()));
          console.log('[COMMAND_REGISTRY] Successfully registered "pause" command handler with mod permissions.');
        }
        
        if (typeof pauseCommandModule.handleResumeCommand === 'function') {
          commandHandlers['resume'] = requireModPermissions((req, res) => pauseCommandModule.handleResumeCommand(req, res, ClientService.getClient()));
          console.log('[COMMAND_REGISTRY] Successfully registered "resume" command handler with mod permissions.');
        }
      }
    } catch (error) {
      console.error('[COMMAND_REGISTRY] Failed to load pause/resume command handlers:', error);
    }
  }
}
