import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Shoe } from './engine/shoe';
import { Hand, PlayerAction } from './engine/card.types';
import {
  calculateHandScore,
  isBlackjack,
  dealerShouldHit,
  calculatePayout,
  RoundResult,
  addCardToHand,
  createHand,
} from './engine/hand-evaluator';

export interface TablePlayer {
  userId: string;
  seatId: string;
  username: string;
  hand?: Hand;
  splitHands?: Hand[];
  bet: number;
  insuranceBet: number;
  actions: PlayerAction[];
  isActive: boolean;
}

export interface GameState {
  tableId: string;
  status: 'WAITING' | 'BETTING' | 'DEALING' | 'PLAYER_TURN' | 'DEALER_TURN' | 'SETTLING';
  shoe: Shoe;
  dealerHand: Hand;
  players: Map<string, TablePlayer>; // seatId -> player
  currentPlayerSeatId: string | null;
  roundId: string | null;
  minBet: number;
  maxBet: number;
}

@Injectable()
export class GameEngineService {
  private readonly logger = new Logger(GameEngineService.name);
  private tables: Map<string, GameState> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Initialize a new table game state
   */
  async initializeTable(
    tableId: string,
    minBet: number,
    maxBet: number,
    deckCount: number = 6,
  ): Promise<GameState> {
    const gameState: GameState = {
      tableId,
      status: 'WAITING',
      shoe: new Shoe(deckCount),
      dealerHand: createHand(),
      players: new Map(),
      currentPlayerSeatId: null,
      roundId: null,
      minBet,
      maxBet,
    };

    this.tables.set(tableId, gameState);
    this.logger.log(`Initialized table ${tableId}`);
    return gameState;
  }

  /**
   * Get table state
   */
  getTableState(tableId: string): GameState | null {
    return this.tables.get(tableId) || null;
  }

  /**
   * Add player to table
   */
  addPlayer(
    tableId: string,
    userId: string,
    seatId: string,
    username: string,
  ): boolean {
    const state = this.tables.get(tableId);
    if (!state) return false;

    state.players.set(seatId, {
      userId,
      seatId,
      username,
      bet: 0,
      insuranceBet: 0,
      actions: [],
      isActive: true,
    });

    this.logger.log(`Player ${username} joined table ${tableId} at seat ${seatId}`);
    return true;
  }

  /**
   * Remove player from table
   */
  removePlayer(tableId: string, seatId: string): boolean {
    const state = this.tables.get(tableId);
    if (!state) return false;

    state.players.delete(seatId);
    this.logger.log(`Player left seat ${seatId} at table ${tableId}`);
    return true;
  }

  /**
   * Place bet for a player (validated against wallet in service layer)
   */
  placeBet(tableId: string, seatId: string, amount: number): boolean {
    const state = this.tables.get(tableId);
    if (!state || state.status !== 'BETTING') return false;

    const player = state.players.get(seatId);
    if (!player) return false;

    if (amount < state.minBet || amount > state.maxBet) {
      return false;
    }

    player.bet = amount;
    this.logger.log(`Player ${seatId} bet ${amount} at table ${tableId}`);
    return true;
  }

  /**
   * Start a new round - deal initial cards
   */
  async startRound(tableId: string): Promise<{ success: boolean; message: string }> {
    const state = this.tables.get(tableId);
    if (!state) {
      return { success: false, message: 'Table not found' };
    }

    if (state.status !== 'BETTING') {
      return { success: false, message: 'Table not in betting phase' };
    }

    // Check if there are any players with bets
    const activePlayers = Array.from(state.players.values()).filter(p => p.bet > 0);
    if (activePlayers.length === 0) {
      return { success: false, message: 'No players placed bets' };
    }

    state.status = 'DEALING';
    state.dealerHand = createHand();

    // Create round in database
    const round = await this.prisma.gameRound.create({
      data: {
        tableId,
        status: 'DEALT',
        startedAt: new Date(),
      },
    });

    state.roundId = round.id;

    // Deal cards: Player-Dealer-Player-Dealer (one card each, then second)
    for (const [seatId, player] of state.players) {
      if (player.bet === 0) {
        player.isActive = false; // Skip players who didn't bet
        continue;
      }

      player.isActive = true;
      player.hand = createHand();
      player.actions = [];

      // First card to player
      const card1 = state.shoe.dealCard();
      if (card1) addCardToHand(player.hand, card1);

      // Second card to player
      const card2 = state.shoe.dealCard();
      if (card2) addCardToHand(player.hand, card2);
    }

    // Dealer's first card (visible)
    const dealerCard1 = state.shoe.dealCard();
    if (dealerCard1) addCardToHand(state.dealerHand, dealerCard1);

    // Dealer's second card (hidden)
    const dealerCard2 = state.shoe.dealCard();
    if (dealerCard2) {
      // Don't add to hand score yet - it's hidden
      state.dealerHand.cards.push(dealerCard2);
      // Recalculate with both cards but we'll track which is hidden
    }

    // Check for immediate blackjacks
    let hasBlackjackRound = false;
    for (const player of state.players.values()) {
      if (player.hand && isBlackjack(player.hand.cards)) {
        hasBlackjackRound = true;
        break;
      }
    }

    // Determine first player to act
    state.currentPlayerSeatId = this.getNextActivePlayerSeatId(state);

    if (hasBlackjackRound || !state.currentPlayerSeatId) {
      // If someone has blackjack or no active players, go straight to dealer
      state.status = 'DEALER_TURN';
      await this.playDealerTurn(tableId);
    } else {
      state.status = 'PLAYER_TURN';
    }

    // Save initial hands to database
    await this.saveHandsToDatabase(state);

    this.logger.log(`Round ${round.id} started at table ${tableId}`);
    return { success: true, message: 'Round started' };
  }

  /**
   * Process player action (HIT, STAND, DOUBLE, etc.)
   */
  async processPlayerAction(
    tableId: string,
    seatId: string,
    action: PlayerAction,
  ): Promise<{ success: boolean; message: string; gameState?: GameState }> {
    const state = this.tables.get(tableId);
    if (!state) {
      return { success: false, message: 'Table not found' };
    }

    if (state.status !== 'PLAYER_TURN') {
      return { success: false, message: 'Not player turn phase' };
    }

    if (state.currentPlayerSeatId !== seatId) {
      return { success: false, message: 'Not your turn' };
    }

    const player = state.players.get(seatId);
    if (!player || !player.hand) {
      return { success: false, message: 'Player not found or no hand' };
    }

    switch (action) {
      case PlayerAction.HIT:
        return this.handleHit(state, player);

      case PlayerAction.STAND:
        return this.handleStand(state, player);

      case PlayerAction.DOUBLE:
        return this.handleDouble(state, player);

      case PlayerAction.INSURANCE:
        return this.handleInsurance(state, player);

      default:
        return { success: false, message: 'Invalid action' };
    }
  }

  private handleHit(state: GameState, player: TablePlayer): { success: boolean; message: string; gameState?: GameState } {
    if (!player.hand) return { success: false, message: 'No hand' };

    const card = state.shoe.dealCard();
    if (!card) {
      return { success: false, message: 'Shoe empty' };
    }

    addCardToHand(player.hand, card);
    player.actions.push(PlayerAction.HIT);

    if (player.hand.status === 'BUST') {
      this.logger.log(`Player ${player.seatId} busted`);
      this.moveToNextPlayer(state);
    }

    return { success: true, message: 'Hit processed', gameState: state };
  }

  private handleStand(state: GameState, player: TablePlayer): { success: boolean; message: string; gameState?: GameState } {
    if (!player.hand) return { success: false, message: 'No hand' };

    player.hand.status = 'STAND';
    player.actions.push(PlayerAction.STAND);
    this.logger.log(`Player ${player.seatId} stands`);

    this.moveToNextPlayer(state);
    return { success: true, message: 'Stand processed', gameState: state };
  }

  private async handleDouble(
    state: GameState,
    player: TablePlayer,
  ): Promise<{ success: boolean; message: string; gameState?: GameState }> {
    if (!player.hand) return { success: false, message: 'No hand' };
    if (player.hand.cards.length !== 2) {
      return { success: false, message: 'Can only double on first two cards' };
    }

    // Double the bet (validated in service layer against wallet)
    player.bet *= 2;
    player.hand.status = 'DOUBLED';
    player.actions.push(PlayerAction.DOUBLE);

    // Deal one more card
    const card = state.shoe.dealCard();
    if (card) {
      addCardToHand(player.hand, card);
    }

    this.logger.log(`Player ${player.seatId} doubled down`);
    this.moveToNextPlayer(state);

    return { success: true, message: 'Double down processed', gameState: state };
  }

  private handleInsurance(
    state: GameState,
    player: TablePlayer,
  ): { success: boolean; message: string; gameState?: GameState } {
    // Insurance can only be offered when dealer shows Ace
    const dealerUpCard = state.dealerHand.cards[0];
    if (!dealerUpCard || dealerUpCard.value !== 'A') {
      return { success: false, message: 'Insurance not available' };
    }

    if (player.insuranceBet > 0) {
      return { success: false, message: 'Already took insurance' };
    }

    // Insurance bet is half of original bet
    player.insuranceBet = player.bet / 2;
    player.actions.push(PlayerAction.INSURANCE);

    this.logger.log(`Player ${player.seatId} took insurance`);
    return { success: true, message: 'Insurance placed', gameState: state };
  }

  /**
   * Move to next player or dealer turn
   */
  private moveToNextPlayer(state: GameState): void {
    state.currentPlayerSeatId = this.getNextActivePlayerSeatId(state);

    if (!state.currentPlayerSeatId) {
      // All players finished, dealer's turn
      state.status = 'DEALER_TURN';
    }
  }

  private getNextActivePlayerSeatId(state: GameState): string | null {
    const seats = Array.from(state.players.keys());
    const currentIndex = seats.indexOf(state.currentPlayerSeatId || '');

    for (let i = currentIndex + 1; i < seats.length; i++) {
      const seatId = seats[i];
      const player = state.players.get(seatId);
      if (player && player.isActive && player.bet > 0 && player.hand?.status === 'ACTIVE') {
        return seatId;
      }
    }

    return null;
  }

  /**
   * Dealer plays their hand according to casino rules
   */
  async playDealerTurn(tableId: string): Promise<void> {
    const state = this.tables.get(tableId);
    if (!state) return;

    state.status = 'DEALER_TURN';
    this.logger.log(`Dealer turn at table ${tableId}`);

    // Reveal dealer's hole card and calculate proper score
    const { score, isSoft } = calculateHandScore(state.dealerHand.cards);
    state.dealerHand.score = score;
    state.dealerHand.isSoft = isSoft;

    // Check for dealer blackjack
    if (isBlackjack(state.dealerHand.cards)) {
      state.dealerHand.status = 'BLACKJACK';
      this.logger.log('Dealer has Blackjack!');
    } else {
      // Dealer hits according to rules (stand on soft 17)
      while (dealerShouldHit(state.dealerHand)) {
        const card = state.shoe.dealCard();
        if (card) {
          addCardToHand(state.dealerHand, card);
          this.logger.log(`Dealer hits: ${card.code}, score: ${state.dealerHand.score}`);
        } else {
          break;
        }
      }
    }

    // Settle all bets
    state.status = 'SETTLING';
    await this.settleRound(tableId);
  }

  /**
   * Calculate results and payouts for all players
   */
  private async settleRound(tableId: string): Promise<void> {
    const state = this.tables.get(tableId);
    if (!state || !state.roundId) return;

    const dealerHasBlackjack = state.dealerHand.status === 'BLACKJACK';
    const dealerScore = state.dealerHand.score;

    // Update round with dealer info
    await this.prisma.gameRound.update({
      where: { id: state.roundId },
      data: {
        dealerScore,
        dealerHasBlackjack,
        status: 'FINISHED',
        finishedAt: new Date(),
      },
    });

    // Calculate and process each player's result
    for (const player of state.players.values()) {
      if (!player.isActive || player.bet === 0 || !player.hand) continue;

      const playerHasBlackjack = player.hand.status === 'BLACKJACK';
      const playerScore = player.hand.score;

      const payoutResult = calculatePayout(
        playerScore,
        dealerScore,
        playerHasBlackjack,
        dealerHasBlackjack,
        player.bet,
        player.insuranceBet,
      );

      this.logger.log(
        `Player ${player.seatId}: ${payoutResult.reason} - Payout: ${payoutResult.payout}x`,
      );

      // Update player round record
      await this.prisma.gameRoundPlayer.updateMany({
        where: {
          roundId: state.roundId,
          seatId: player.seatId,
        },
        data: {
          handStatus: player.hand.status as any,
          score: playerScore,
          payout: player.bet * payoutResult.payout,
          isBlackjack: playerHasBlackjack,
          insuranceBet: player.insuranceBet,
        },
      });

      // Process wallet transaction (implemented in WalletService)
      // This would be called from the TableService
    }

    // Reset table for next round
    setTimeout(() => {
      this.resetTableForNewRound(tableId);
    }, 5000); // 5 second delay before next betting phase
  }

  /**
   * Reset table state for new round
   */
  private resetTableForNewRound(tableId: string): void {
    const state = this.tables.get(tableId);
    if (!state) return;

    state.status = 'BETTING';
    state.dealerHand = createHand();
    state.currentPlayerSeatId = null;
    state.roundId = null;

    for (const player of state.players.values()) {
      player.hand = undefined;
      player.splitHands = undefined;
      player.bet = 0;
      player.insuranceBet = 0;
      player.actions = [];
      player.isActive = true;
    }

    this.logger.log(`Table ${tableId} ready for new betting phase`);
  }

  /**
   * Save hands to database (called during round)
   */
  private async saveHandsToDatabase(state: GameState): Promise<void> {
    if (!state.roundId) return;

    for (const [seatId, player] of state.players) {
      if (!player.isActive || player.bet === 0) continue;

      // Create round player record
      const roundPlayer = await this.prisma.gameRoundPlayer.create({
        data: {
          roundId: state.roundId,
          userId: player.userId,
          seatId,
          betAmount: player.bet,
          handStatus: 'ACTIVE',
          score: player.hand?.score || 0,
        },
      });

      // Create hand record
      if (player.hand) {
        await this.prisma.playerHand.create({
          data: {
            roundPlayerId: roundPlayer.id,
            cards: JSON.stringify(player.hand.cards.map(c => c.code)),
            score: player.hand.score,
            status: player.hand.status,
          },
        });
      }
    }
  }
}
