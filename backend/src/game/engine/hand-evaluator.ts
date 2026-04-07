import { Card, Hand } from './card.types';

/**
 * Calculate hand score with proper Ace handling
 * Casino-standard rules: Ace is 11 unless it would bust the hand
 */
export function calculateHandScore(cards: Card[]): { score: number; isSoft: boolean } {
  let score = 0;
  let aceCount = 0;

  for (const card of cards) {
    if (card.value === 'A') {
      aceCount++;
      score += 11; // Initially count Ace as 11
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      score += 10;
    } else {
      score += card.numericValue;
    }
  }

  // Adjust Aces from 11 to 1 if needed to avoid busting
  let isSoft = false;
  while (score > 21 && aceCount > 0) {
    score -= 10; // Convert one Ace from 11 to 1
    aceCount--;
  }

  // Hand is "soft" if there's still an Ace counted as 11
  isSoft = aceCount > 0 && score <= 21;

  return { score, isSoft };
}

/**
 * Check if hand is a Blackjack (Ace + 10-value card)
 */
export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const { score } = calculateHandScore(cards);
  return score === 21;
}

/**
 * Check if hand is busted (over 21)
 */
export function isBust(score: number): boolean {
  return score > 21;
}

/**
 * Create a new Hand object
 */
export function createHand(): Hand {
  return {
    cards: [],
    score: 0,
    isSoft: false,
    status: 'ACTIVE',
  };
}

/**
 * Add card to hand and recalculate score
 */
export function addCardToHand(hand: Hand, card: Card): Hand {
  hand.cards.push(card);
  const { score, isSoft } = calculateHandScore(hand.cards);
  hand.score = score;
  hand.isSoft = isSoft;

  if (score > 21) {
    hand.status = 'BUST';
  } else if (score === 21 && hand.cards.length === 2) {
    hand.status = 'BLACKJACK';
  }

  return hand;
}

/**
 * Dealer AI logic - stands on soft 17 (casino standard)
 */
export function dealerShouldHit(dealerHand: Hand): boolean {
  // Hit on 16 or less
  if (dealerHand.score < 17) {
    return true;
  }

  // Stand on hard 17 or higher
  if (dealerHand.score >= 17 && !dealerHand.isSoft) {
    return false;
  }

  // Stand on soft 17 (casino rule: dealer stands on soft 17)
  if (dealerHand.score === 17 && dealerHand.isSoft) {
    return false;
  }

  // Hit on soft 18+ (some variants hit soft 18, but we stand on soft 17+)
  if (dealerHand.score > 17 && dealerHand.isSoft) {
    return false;
  }

  return false;
}

/**
 * Determine round result for a player hand vs dealer
 */
export enum RoundResult {
  WIN = 'WIN',
  LOSE = 'LOSE',
  PUSH = 'PUSH',
  BLACKJACK = 'BLACKJACK',
  INSURANCE_WIN = 'INSURANCE_WIN',
  INSURANCE_LOSE = 'INSURANCE_LOSE',
}

export interface PayoutResult {
  result: RoundResult;
  payout: number; // Multiplier (1.0 = even money, 1.5 = blackjack 3:2)
  reason: string;
}

/**
 * Calculate payout based on player hand, dealer hand, and bets
 */
export function calculatePayout(
  playerScore: number,
  dealerScore: number,
  playerHasBlackjack: boolean,
  dealerHasBlackjack: boolean,
  betAmount: number,
  insuranceBet: number = 0,
): PayoutResult {
  let totalPayout = 0;
  let result: RoundResult;
  let reason = '';

  // Handle insurance first
  if (insuranceBet > 0) {
    if (dealerHasBlackjack) {
      totalPayout += insuranceBet * 2; // Insurance pays 2:1
      result = RoundResult.INSURANCE_WIN;
      reason = 'Insurance wins (dealer has Blackjack)';
    } else {
      result = RoundResult.INSURANCE_LOSE;
      reason = 'Insurance loses (dealer no Blackjack)';
    }
  }

  // Handle main bet
  if (playerHasBlackjack && dealerHasBlackjack) {
    // Both have blackjack - push
    totalPayout += betAmount;
    result = RoundResult.PUSH;
    reason = 'Both have Blackjack - Push';
  } else if (playerHasBlackjack) {
    // Player blackjack, dealer doesn't - win 3:2
    totalPayout += betAmount * 2.5; // Return bet + 1.5x win
    result = RoundResult.BLACKJACK;
    reason = 'Blackjack pays 3:2';
  } else if (dealerHasBlackjack) {
    // Dealer blackjack, player doesn't - lose
    result = RoundResult.LOSE;
    reason = 'Dealer has Blackjack';
  } else if (playerScore > 21) {
    // Player busted
    result = RoundResult.LOSE;
    reason = 'Player busted';
  } else if (dealerScore > 21) {
    // Dealer busted, player didn't
    totalPayout += betAmount * 2;
    result = RoundResult.WIN;
    reason = 'Dealer busted';
  } else if (playerScore > dealerScore) {
    // Player wins
    totalPayout += betAmount * 2;
    result = RoundResult.WIN;
    reason = 'Player wins';
  } else if (playerScore < dealerScore) {
    // Dealer wins
    result = RoundResult.LOSE;
    reason = 'Dealer wins';
  } else {
    // Push
    totalPayout += betAmount;
    result = RoundResult.PUSH;
    reason = 'Push (tie)';
  }

  return {
    result,
    payout: totalPayout / (betAmount || 1), // Normalize to multiplier
    reason,
  };
}
