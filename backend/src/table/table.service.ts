import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { GameEngineService } from '../game/game-engine.service';
import { PlayerAction } from '../game/engine/card.types';

export interface CreateTableDto {
  name: string;
  minBet: number;
  maxBet: number;
  deckCount?: number;
}

export interface JoinTableDto {
  position: number; // 0-6
}

export interface PlaceBetDto {
  amount: number;
}

export interface PlayerActionDto {
  action: PlayerAction;
}

@Injectable()
export class TableService {
  private readonly logger = new Logger(TableService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private gameEngine: GameEngineService,
  ) {}

  /**
   * Get all available tables
   */
  async getTables() {
    const tables = await this.prisma.gameTable.findMany({
      where: {
        status: {
          in: ['WAITING', 'BETTING', 'PLAYING'],
        },
      },
      include: {
        seats: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    return tables.map((table) => ({
      id: table.id,
      name: table.name,
      minBet: parseFloat(table.minBet.toString()),
      maxBet: parseFloat(table.maxBet.toString()),
      status: table.status,
      seats: table.seats.map((seat) => ({
        position: seat.position,
        isActive: seat.isActive,
        currentBet: parseFloat(seat.currentBet.toString()),
        user: seat.user
          ? {
              id: seat.user.id,
              username: seat.user.username,
            }
          : null,
      })),
      occupiedSeats: table.seats.filter((s) => s.isActive).length,
      totalSeats: 7,
    }));
  }

  /**
   * Create a new table
   */
  async createTable(dto: CreateTableDto) {
    const table = await this.prisma.gameTable.create({
      data: {
        name: dto.name,
        minBet: dto.minBet,
        maxBet: dto.maxBet,
        deckCount: dto.deckCount || 6,
        status: 'WAITING',
      },
      include: {
        seats: true,
      },
    });

    // Initialize game engine state for this table
    await this.gameEngine.initializeTable(
      table.id,
      parseFloat(table.minBet.toString()),
      parseFloat(table.maxBet.toString()),
      table.deckCount,
    );

    this.logger.log(`Created table ${table.id}: ${table.name}`);
    return table;
  }

  /**
   * Join a table at a specific seat
   */
  async joinTable(
    tableId: string,
    userId: string,
    username: string,
    position: number,
  ) {
    if (position < 0 || position > 6) {
      throw new BadRequestException('Invalid seat position (must be 0-6)');
    }

    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
      include: {
        seats: {
          where: { position },
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    // Check if seat is taken
    if (table.seats.length > 0 && table.seats[0].isActive) {
      throw new BadRequestException('Seat already occupied');
    }

    // Update or create seat
    const seat = await this.prisma.seat.upsert({
      where: {
        tableId_position: {
          tableId,
          position,
        },
      },
      update: {
        userId,
        isActive: true,
        currentBet: 0,
      },
      create: {
        tableId,
        position,
        userId,
        isActive: true,
        currentBet: 0,
      },
    });

    // Add player to game engine state
    this.gameEngine.addPlayer(tableId, userId, seat.id, username);

    // Update table status if first player joins
    if (table.status === 'WAITING') {
      await this.prisma.gameTable.update({
        where: { id: tableId },
        data: { status: 'BETTING' },
      });
    }

    this.logger.log(`User ${userId} joined table ${tableId} at position ${position}`);
    return seat;
  }

  /**
   * Leave a table
   */
  async leaveTable(tableId: string, userId: string) {
    const seat = await this.prisma.seat.findFirst({
      where: {
        tableId,
        userId,
        isActive: true,
      },
    });

    if (!seat) {
      throw new NotFoundException('Seat not found');
    }

    await this.prisma.seat.update({
      where: { id: seat.id },
      data: {
        isActive: false,
        userId: null,
        currentBet: 0,
      },
    });

    this.gameEngine.removePlayer(tableId, seat.id);

    this.logger.log(`User ${userId} left table ${tableId}`);
    return { success: true };
  }

  /**
   * Place a bet for current round
   */
  async placeBet(
    tableId: string,
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    const seat = await this.prisma.seat.findFirst({
      where: {
        tableId,
        userId,
        isActive: true,
      },
      include: {
        table: true,
      },
    });

    if (!seat) {
      throw new NotFoundException('Active seat not found');
    }

    if (seat.table.status !== 'BETTING') {
      throw new BadRequestException('Table is not in betting phase');
    }

    // Validate bet limits
    const minBet = parseFloat(seat.table.minBet.toString());
    const maxBet = parseFloat(seat.table.maxBet.toString());

    if (amount < minBet || amount > maxBet) {
      throw new BadRequestException(
        `Bet must be between ${minBet} and ${maxBet}`,
      );
    }

    // Process bet through wallet service
    const referenceId = `${tableId}-${Date.now()}`;
    const result = await this.walletService.placeBet(userId, amount, referenceId);

    // Update seat bet
    await this.prisma.seat.update({
      where: { id: seat.id },
      data: { currentBet: amount },
    });

    // Register bet in game engine
    this.gameEngine.placeBet(tableId, seat.id, amount);

    this.logger.log(`User ${userId} placed bet of ${amount} at table ${tableId}`);
    return result;
  }

  /**
   * Start a new round (when all players have placed bets or timeout)
   */
  async startRound(tableId: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    if (table.status !== 'BETTING') {
      throw new BadRequestException('Table is not in betting phase');
    }

    // Start round in game engine
    const result = await this.gameEngine.startRound(tableId);

    if (result.success) {
      await this.prisma.gameTable.update({
        where: { id: tableId },
        data: { status: 'PLAYING' },
      });
    }

    return result;
  }

  /**
   * Process player action (HIT, STAND, DOUBLE, etc.)
   */
  async processAction(
    tableId: string,
    userId: string,
    action: PlayerAction,
  ) {
    const seat = await this.prisma.seat.findFirst({
      where: {
        tableId,
        userId,
        isActive: true,
      },
    });

    if (!seat) {
      throw new NotFoundException('Active seat not found');
    }

    // Handle double down - need to deduct additional bet
    if (action === PlayerAction.DOUBLE) {
      const additionalBet = parseFloat(seat.currentBet.toString());
      const referenceId = `${tableId}-double-${Date.now()}`;
      await this.walletService.doubleDown(userId, additionalBet, referenceId);

      // Update seat bet
      await this.prisma.seat.update({
        where: { id: seat.id },
        data: { currentBet: additionalBet * 2 },
      });
    }

    // Process action in game engine
    const result = await this.gameEngine.processPlayerAction(
      tableId,
      seat.id,
      action,
    );

    return result;
  }

  /**
   * Get detailed table state including cards
   */
  async getTableState(tableId: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
      include: {
        seats: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
        rounds: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            players: {
              include: {
                hands: true,
              },
            },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    // Get game engine state for real-time card info
    const gameState = this.gameEngine.getTableState(tableId);

    return {
      id: table.id,
      name: table.name,
      minBet: parseFloat(table.minBet.toString()),
      maxBet: parseFloat(table.maxBet.toString()),
      status: table.status,
      deckCount: table.deckCount,
      dealerCard1: table.dealerCard1,
      dealerCard2: table.dealerCard2,
      seats: table.seats.map((seat) => ({
        position: seat.position,
        isActive: seat.isActive,
        currentBet: parseFloat(seat.currentBet.toString()),
        user: seat.user
          ? {
              id: seat.user.id,
              username: seat.user.username,
            }
          : null,
      })),
      currentRound: table.rounds[0]
        ? {
            id: table.rounds[0].id,
            status: table.rounds[0].status,
            dealerScore: table.rounds[0].dealerScore,
            players: table.rounds[0].players.map((p) => ({
              score: p.score,
              handStatus: p.handStatus,
              betAmount: parseFloat(p.betAmount.toString()),
              payout: parseFloat(p.payout.toString()),
              isBlackjack: p.isBlackjack,
              hands: p.hands.map((h) => ({
                cards: JSON.parse(h.cards),
                score: h.score,
                status: h.status,
              })),
            })),
          }
        : null,
      gameState: gameState
        ? {
            currentPlayerSeatId: gameState.currentPlayerSeatId,
            dealerHand: gameState.dealerHand,
          }
        : null,
    };
  }
}
