/**
 * Card representation
 * Format: {suit}-{value}
 * Suits: H (Hearts), D (Diamonds), C (Clubs), S (Spades)
 * Values: 2-10, J, Q, K, A
 */
export interface Card {
  suit: 'H' | 'D' | 'C' | 'S';
  value: string;
  numericValue: number;
  code: string; // e.g., "H-A", "D-10"
}

export interface Hand {
  cards: Card[];
  score: number;
  isSoft: boolean; // Contains Ace counted as 11
  status: 'ACTIVE' | 'STAND' | 'BUST' | 'BLACKJACK' | 'DOUBLED';
  bet?: number;
  insuranceBet?: number;
}

export enum PlayerAction {
  HIT = 'HIT',
  STAND = 'STAND',
  DOUBLE = 'DOUBLE',
  SPLIT = 'SPLIT',
  INSURANCE = 'INSURANCE',
}
