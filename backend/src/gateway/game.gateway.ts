import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TableService } from '../table/table.service';
import { WalletService } from '../wallet/wallet.service';
import { AuthService } from '../auth/auth.service';
import { PlayerAction } from '../game/engine/card.types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  tableId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure appropriately for production
    credentials: true,
  },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private tableService: TableService,
    private walletService: WalletService,
    private authService: AuthService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Handle player leaving table on disconnect
    if (client.tableId && client.userId) {
      try {
        await this.tableService.leaveTable(client.tableId, client.userId);
        this.broadcastTableState(client.tableId);
      } catch (error) {
        this.logger.error(`Error handling disconnect: ${error.message}`);
      }
    }
  }

  /**
   * Authenticate user via JWT token
   */
  @SubscribeMessage('authenticate')
  async handleAuthentication(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { token: string },
  ) {
    try {
      // Verify token by getting user profile
      const payload = this.authService.validateUserFromToken(data.token);
      
      if (payload) {
        client.userId = payload.id;
        client.username = payload.username;
        
        client.emit('authenticated', {
          success: true,
          user: {
            id: payload.id,
            username: payload.username,
          },
          wallet: payload.wallet,
        });

        this.logger.log(`User ${payload.username} authenticated via WebSocket`);
      } else {
        client.emit('authentication_error', {
          success: false,
          message: 'Invalid token',
        });
      }
    } catch (error) {
      client.emit('authentication_error', {
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Join a table
   */
  @SubscribeMessage('join_table')
  async handleJoinTable(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string; position: number },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const seat = await this.tableService.joinTable(
        data.tableId,
        client.userId,
        client.username,
        data.position,
      );

      client.tableId = data.tableId;
      client.join(`table:${data.tableId}`);

      // Send updated table state to all clients in the room
      await this.broadcastTableState(data.tableId);

      client.emit('table_joined', {
        success: true,
        seat: {
          position: seat.position,
          id: seat.id,
        },
      });

      this.logger.log(
        `User ${client.username} joined table ${data.tableId} at position ${data.position}`,
      );
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Leave a table
   */
  @SubscribeMessage('leave_table')
  async handleLeaveTable(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      await this.tableService.leaveTable(data.tableId, client.userId);
      client.leave(`table:${data.tableId}`);
      client.tableId = undefined;

      await this.broadcastTableState(data.tableId);

      client.emit('table_left', { success: true });
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Place a bet
   */
  @SubscribeMessage('place_bet')
  async handlePlaceBet(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string; amount: number },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const result = await this.tableService.placeBet(
        data.tableId,
        client.userId,
        data.amount,
      );

      await this.broadcastTableState(data.tableId);

      client.emit('bet_placed', {
        success: true,
        amount: data.amount,
        newBalance: result.newBalance,
      });
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Start a round (dealer or automated)
   */
  @SubscribeMessage('start_round')
  async handleStartRound(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    try {
      const result = await this.tableService.startRound(data.tableId);
      await this.broadcastTableState(data.tableId);

      if (result.success) {
        client.emit('round_started', result);
      } else {
        client.emit('error', { message: result.message });
      }
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Player action (HIT, STAND, DOUBLE, etc.)
   */
  @SubscribeMessage('player_action')
  async handlePlayerAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string; action: PlayerAction },
  ) {
    if (!client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const result = await this.tableService.processAction(
        data.tableId,
        client.userId,
        data.action,
      );

      await this.broadcastTableState(data.tableId);

      if (result.success) {
        client.emit('action_processed', {
          success: true,
          action: data.action,
        });
      } else {
        client.emit('error', { message: result.message });
      }
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Get current table state
   */
  @SubscribeMessage('get_table_state')
  async handleGetTableState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string },
  ) {
    try {
      const state = await this.tableService.getTableState(data.tableId);
      client.emit('table_state', state);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Broadcast table state to all clients in the room
   */
  private async broadcastTableState(tableId: string) {
    try {
      const state = await this.tableService.getTableState(tableId);
      this.server.to(`table:${tableId}`).emit('table_update', state);
    } catch (error) {
      this.logger.error(`Error broadcasting table state: ${error.message}`);
    }
  }

  /**
   * Send chat message (bonus feature)
   */
  @SubscribeMessage('chat_message')
  handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { tableId: string; message: string },
  ) {
    if (!client.userId || !client.username) {
      return;
    }

    this.server.to(`table:${data.tableId}`).emit('chat_message', {
      username: client.username,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Add helper method to AuthService for token validation without guards
// This is a simplified version - in production use proper JWT verification
