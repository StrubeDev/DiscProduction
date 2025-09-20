/**
 * Component handler registry for message components and modals
 */
import { InteractionResponseType } from 'discord-interactions';
import { ClientService } from '../../services/client-service.js';

export class ComponentRegistry {
  static async registerAll() {
    const messageComponentHandlers = {};
    const modalSubmitHandlers = {};

    try {
      // Import required modules
      const menuNavHandlers = await import('../menu-component-handlers.js');
      const { routeMenuNavigation } = await import('../../routers/menu-router.js');
      const { handleModAccessGranter } = await import('../tools/access-control.js');
      const { handleModGifManagement } = await import('../tools/gif-management.js');
      const { handleMenuNavTips } = await import('../tools/quick-tips.js');

      // Register menu navigation handlers
      await this.registerMenuNavigationHandlers(messageComponentHandlers, menuNavHandlers, routeMenuNavigation, handleMenuNavTips);
      
      // Register access control handlers
      await this.registerAccessControlHandlers(messageComponentHandlers, menuNavHandlers, handleModAccessGranter);
      
      // Register GIF management handlers
      await this.registerGifManagementHandlers(messageComponentHandlers, handleModGifManagement);
      
      // Register modal handlers
      await this.registerModalHandlers(messageComponentHandlers, menuNavHandlers);
      
      // Register remote control handlers
      await this.registerRemoteControlHandlers(messageComponentHandlers, menuNavHandlers);
      
      // Register modal submit handlers
      await this.registerModalSubmitHandlers(modalSubmitHandlers);

      console.log('[COMPONENT_REGISTRY] Initialized Component Handlers:');
      console.log('[COMPONENT_REGISTRY] Message Components:', Object.keys(messageComponentHandlers));
      console.log('[COMPONENT_REGISTRY] Modal Submissions:', Object.keys(modalSubmitHandlers));
      
      return { messageComponentHandlers, modalSubmitHandlers };
    } catch (error) {
      console.error('[COMPONENT_REGISTRY] Failed to register component handlers:', error);
      return { messageComponentHandlers: {}, modalSubmitHandlers: {} };
    }
  }

  static async registerMenuNavigationHandlers(messageComponentHandlers, menuNavHandlers, routeMenuNavigation, handleMenuNavTips) {
    // Reset button handler
    messageComponentHandlers['bot_reset'] = (req, res, data) => {
      console.log('[COMPONENT_REGISTRY] Reset button handler called!');
      console.log('[COMPONENT_REGISTRY] Request body:', JSON.stringify(req.body, null, 2));
      return menuNavHandlers.handleBotReset(req, res, data, ClientService.getClient());
    };

    // Navigation handlers
    messageComponentHandlers['menu_nav_playback'] = (req, res, data) => routeMenuNavigation('menu_nav_playback', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_queue'] = (req, res, data) => routeMenuNavigation('menu_nav_queue_history', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_config'] = (req, res, data) => routeMenuNavigation('menu_nav_config', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_config_tools'] = (req, res, data) => routeMenuNavigation('menu_nav_config', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_tips'] = (req, res, data) => handleMenuNavTips(req, res, data, ClientService.getClient());
    messageComponentHandlers['menu_nav_features'] = (req, res, data) => routeMenuNavigation('menu_nav_tools', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_mod_menu'] = (req, res, data) => routeMenuNavigation('menu_nav_mod', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_main'] = (req, res, data) => routeMenuNavigation('menu_nav_main', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_bot_voice_controls'] = (req, res, data) => routeMenuNavigation('menu_nav_bot_voice_controls', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_queue_history'] = (req, res, data) => routeMenuNavigation('menu_nav_queue_history', req, res, ClientService.getClient());
    messageComponentHandlers['menu_nav_quick_tips'] = (req, res, data) => handleMenuNavTips(req, res, data, ClientService.getClient());

    // Bot voice control handlers
    messageComponentHandlers['bot_join_vc'] = (req, res, data) => menuNavHandlers.handleBotJoinVC(req, res, data, ClientService.getClient());
    messageComponentHandlers['bot_disconnect_vc'] = (req, res, data) => menuNavHandlers.handleBotDisconnectVC(req, res, data, ClientService.getClient());
    messageComponentHandlers['bot_vc_select_config'] = (req, res, data) => menuNavHandlers.handleBotVCSelectConfig(req, res, data, ClientService.getClient());

    // Queue display handlers
    messageComponentHandlers['set_queue_display_menu'] = (req, res, data) => menuNavHandlers.handleSetQueueDisplayMenu(req, res, data, ClientService.getClient());
    messageComponentHandlers['set_queue_display_chat'] = (req, res, data) => menuNavHandlers.handleSetQueueDisplayChat(req, res, data, ClientService.getClient());

    console.log('[COMPONENT_REGISTRY] Successfully registered menu navigation handlers.');
  }

  static async registerAccessControlHandlers(messageComponentHandlers, menuNavHandlers, handleModAccessGranter) {
    // Unified permission handlers (new system)
    messageComponentHandlers['access_unified_roles'] = (req, res, data) => menuNavHandlers.handleAccessUnifiedRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_unified_everyone'] = (req, res, data) => menuNavHandlers.handleAccessUnifiedEveryone(req, res, data, ClientService.getClient());
    messageComponentHandlers['add_unified_roles'] = (req, res, data) => menuNavHandlers.handleAddUnifiedRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['remove_unified_roles'] = (req, res, data) => menuNavHandlers.handleRemoveUnifiedRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['view_role_ids'] = (req, res, data) => menuNavHandlers.handleViewRoleIds(req, res, data, ClientService.getClient());

    // Legacy handlers (keeping for backward compatibility)
    messageComponentHandlers['access_slash_roles'] = (req, res, data) => menuNavHandlers.handleAccessSlashRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_slash_everyone'] = (req, res, data) => menuNavHandlers.handleAccessSlashEveryone(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_components_roles'] = (req, res, data) => menuNavHandlers.handleAccessComponentsRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_components_everyone'] = (req, res, data) => menuNavHandlers.handleAccessComponentsEveryone(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleAccessBotControlsRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['access_bot_controls_everyone'] = (req, res, data) => menuNavHandlers.handleAccessBotControlsEveryone(req, res, data, ClientService.getClient());

    // View role handlers
    messageComponentHandlers['view_slash_roles'] = (req, res, data) => menuNavHandlers.handleViewSlashRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['view_components_roles'] = (req, res, data) => menuNavHandlers.handleViewComponentsRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['view_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleViewBotControlsRoles(req, res, data, ClientService.getClient());

    // Clear role handlers
    messageComponentHandlers['clear_slash_roles'] = (req, res, data) => menuNavHandlers.handleClearSlashRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['clear_components_roles'] = (req, res, data) => menuNavHandlers.handleClearComponentsRoles(req, res, data, ClientService.getClient());
    messageComponentHandlers['clear_bot_controls_roles'] = (req, res, data) => menuNavHandlers.handleClearBotControlsRoles(req, res, data, ClientService.getClient());

    // Access control handler
    messageComponentHandlers['mod_access_granter'] = (req, res, data) => handleModAccessGranter(req, res, data, ClientService.getClient());

    console.log('[COMPONENT_REGISTRY] Successfully registered access control handlers.');
  }

  static async registerGifManagementHandlers(messageComponentHandlers, handleModGifManagement) {
    messageComponentHandlers['mod_gif_management'] = (req, res, data) => handleModGifManagement(req, res, data, ClientService.getClient());
    console.log('[COMPONENT_REGISTRY] Successfully registered GIF management handlers.');
  }

  static async registerModalHandlers(messageComponentHandlers, menuNavHandlers) {
    // Timeout modal handler
    messageComponentHandlers['open_set_timeout_modal'] = async (req, res) => {
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id;

        // Check config permissions
        const { checkBotControlsPermissions } = await import('../../../middleware/permissionMiddleware.js');
        if (!await checkBotControlsPermissions(ClientService.getClient(), guildId, userId)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need config permissions to use this control.',
              flags: 64
            }
          });
        }

        const { getSetTimeoutModalData } = await import('../../../ui/modal-data.js');
        const modalData = getSetTimeoutModalData();
        console.log('Attempting to send modal:', JSON.stringify(modalData, null, 2));

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modalData
        });
      } catch (error) {
        console.error("Error preparing or sending modal:", error);
        return res.status(500).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "Sorry, I couldn't open the timeout settings. Please try again.", flags: 64 }
        });
      }
    };

    // Add song modal handler
    messageComponentHandlers['open_add_song_modal'] = (req, res) => {
      try {
        console.log('[COMPONENT_REGISTRY] open_add_song_modal handler called');
        
        if (typeof menuNavHandlers.getAddSongModalData !== 'function') {
          console.error('[COMPONENT_REGISTRY] getAddSongModalData is not a function!');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Modal function not available. Please try again.',
              flags: 64
            }
          });
        }
        
        const modalData = menuNavHandlers.getAddSongModalData();
        console.log('[COMPONENT_REGISTRY] Modal data:', modalData);
        
        const response = {
          type: InteractionResponseType.MODAL,
          data: modalData,
        };
        
        console.log('[COMPONENT_REGISTRY] Sending modal response:', JSON.stringify(response, null, 2));
        return res.send(response);
      } catch (error) {
        console.error('[COMPONENT_REGISTRY] Error in open_add_song_modal handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ An error occurred while opening the modal. Please try again.',
            flags: 64
          }
        });
      }
    };

    // Duration modal handler
    messageComponentHandlers['open_set_duration_modal'] = async (req, res) => {
      const { getSetDurationModalData } = await import('../../../ui/modal-data.js');
      const modalData = getSetDurationModalData();
      return res.send({
        type: InteractionResponseType.MODAL,
        data: modalData,
      });
    };

    console.log('[COMPONENT_REGISTRY] Successfully registered modal handlers.');
  }

  static async registerRemoteControlHandlers(messageComponentHandlers, menuNavHandlers) {
    messageComponentHandlers['remote_play_pause'] = (req, res, data) => menuNavHandlers.handleRemotePlayPause(req, res, data, ClientService.getClient());
    messageComponentHandlers['remote_skip'] = (req, res, data) => menuNavHandlers.handleRemoteSkip(req, res, data, ClientService.getClient());
    messageComponentHandlers['remote_stop'] = (req, res, data) => menuNavHandlers.handleRemoteStop(req, res, data, ClientService.getClient());
    messageComponentHandlers['remote_shuffle'] = (req, res, data) => menuNavHandlers.handleRemoteShuffle(req, res, data, ClientService.getClient());

    console.log('[COMPONENT_REGISTRY] Successfully registered remote control handlers.');
  }

  static async registerModalSubmitHandlers(modalSubmitHandlers) {
    // Import modal handlers directly from their source files
    const { handleSubmitAddSongModal } = await import('../ui/modals/add-song-modal.js');
    const { handleSubmitTimeoutModal, handleSubmitDurationModal } = await import('../ui/handlers/bot-control-handlers.js');
    const { handleSubmitAddUnifiedRolesModal, handleSubmitRemoveUnifiedRolesModal, handleSubmitRoleManagementModal } = await import('../tools/access-control.js');
    
    modalSubmitHandlers['submit_add_song_modal'] = (req, res, data) => handleSubmitAddSongModal(req, res, data, ClientService.getClient());
    modalSubmitHandlers['submit_set_duration_modal'] = (req, res, data) => handleSubmitDurationModal(req, res, data, ClientService.getClient());
    modalSubmitHandlers['submit_set_timeout_modal'] = (req, res, data) => handleSubmitTimeoutModal(req, res, data, ClientService.getClient());

    // Role management modal submit handlers
    modalSubmitHandlers['submit_role_management_modal_slash_commands'] = (req, res, data) => handleSubmitRoleManagementModal(req, res, data, ClientService.getClient());
    modalSubmitHandlers['submit_role_management_modal_components'] = (req, res, data) => handleSubmitRoleManagementModal(req, res, data, ClientService.getClient());
    modalSubmitHandlers['submit_role_management_modal_bot_controls'] = (req, res, data) => handleSubmitRoleManagementModal(req, res, data, ClientService.getClient());

    // New unified role management modal submit handlers
    modalSubmitHandlers['add_unified_roles_modal'] = (req, res, data) => handleSubmitAddUnifiedRolesModal(req, res, data, ClientService.getClient());
    modalSubmitHandlers['remove_unified_roles_modal'] = (req, res, data) => handleSubmitRemoveUnifiedRolesModal(req, res, data, ClientService.getClient());

    console.log('[COMPONENT_REGISTRY] Successfully registered modal submit handlers.');
  }
}
