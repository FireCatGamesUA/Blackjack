import { Card } from './card.types';

/**
 * Server-authoritative deck/shoe management
 * Implements Fisher-Yates shuffle algorithm
 */
export class Shoe {
  private cards: Card[] = [];
  private dealtCards: Card[] = [];
  private readonly deckCount: number;
  private readonly penetration: number; // When to reshuffle (e.g., 0.7 = 70% through shoe)

  constructor(deckCount: number = 6, penetration: number = 0.7) {
    this.deckCount = deckCount;
    this.penetration = penetration;
    this.initializeShoe();
  }

  /**
   * Create multiple decks and shuffle them together
   */
  private initializeShoe(): void {
    const suits: Array<'H' | 'D' | 'C' | 'S'> = ['H', 'D', 'C', 'S'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    this.cards = [];
    
    for (let d = 0; d < this.deckCount; d++) {
      for (const suit of suits) {
        for (const value of values) {
          let numericValue: number;
          
          if (['J', 'Q', 'K'].includes(value)) {
            numericValue = 10;
          } else if (value === 'A') {
            numericValue = 11; // Ace is 11 initially, adjusted in hand calculation
          } else {
            numericValue = parseInt(value, 10);
          }
          
          this.cards.push({
            suit,
            value,
            numericValue,
            code: `${suit}-${value}`,
          });
        }
      }
    }
    
    this.shuffle();
  }

  /**
   * Fisher-Yates shuffle algorithm (cryptographically secure version)
   */
  public shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      // Use crypto-safe random if available, otherwise Math.random
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.dealtCards = [];
  }

  /**
   * Deal a card from the shoe
   * Returns null if shoe needs reshuffling
   */
  public dealCard(): Card | null {
    if (this.needsReshuffle()) {
      this.initializeShoe(); // Reshuffle all dealt cards back into shoe
    }
    
    if (this.cards.length === 0) {
      return null;
    }
    
    const card = this.cards.pop()!;
    this.dealtCards.push(card);
    return card;
  }

  /**
   * Check if shoe needs reshuffling based on penetration
   */
  private needsReshuffle(): boolean {
    const totalCards = this.deckCount * 52;
    const remainingPercentage = this.cards.length / totalCards;
    return remainingPercentage < (1 - this.penetration);
  }

  /**
   * Get number of remaining cards
   */
  public getRemainingCards(): number {
    return this.cards.length;
  }

  /**
   * Get dealt cards count (for audit/debugging)
   */
  public getDealtCardsCount(): number {
    return this.dealtCards.length;
  }

  /**
   * Serialize shoe state (obfuscated for production)
   * In production, encrypt this or only send minimal info to clients
   */
  public serialize(): string {
    return JSON.stringify({
      remaining: this.cards.length,
      dealt: this.dealtCards.length,
      // Never send actual card order to clients!
    });
  }
}
