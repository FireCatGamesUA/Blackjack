'use client';

import React from 'react';

interface CardProps {
  card: {
    suit: 'H' | 'D' | 'C' | 'S';
    value: string;
    code: string;
  };
  hidden?: boolean;
}

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'H': return '♥';
    case 'D': return '♦';
    case 'C': return '♣';
    case 'S': return '♠';
    default: return '';
  }
};

const isRed = (suit: string) => suit === 'H' || suit === 'D';

export const Card: React.FC<CardProps> = ({ card, hidden = false }) => {
  if (hidden) {
    return <div className="card-back" />;
  }

  const red = isRed(card.suit);

  return (
    <div className={`card ${red ? 'red' : 'black'}`}>
      <div className="card-corner top">
        <span>{card.value}</span>
        <span>{getSuitSymbol(card.suit)}</span>
      </div>
      <div className="card-center">
        {getSuitSymbol(card.suit)}
      </div>
      <div className="card-corner bottom">
        <span>{card.value}</span>
        <span>{getSuitSymbol(card.suit)}</span>
      </div>
    </div>
  );
};

export const DealerCard: React.FC<{ card?: any; hidden?: boolean }> = ({ card, hidden }) => {
  if (!card && !hidden) {
    return <div className="w-[60px] h-[84px] border-2 border-dashed border-white/30 rounded-lg" />;
  }
  
  return <Card card={card} hidden={hidden} />;
};

export const PlayerHand: React.FC<{ 
  cards: any[]; 
  score: number; 
  status: string;
  bet: number;
  isActive?: boolean;
}> = ({ cards, score, status, bet, isActive }) => {
  return (
    <div className={`flex flex-col items-center gap-2 ${isActive ? 'turn-indicator' : ''}`}>
      <div className="flex gap-1">
        {cards.map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </div>
      <div className="text-white font-bold text-sm">
        Score: {score}
        {status === 'BLACKJACK' && ' 🎰 BLACKJACK!'}
        {status === 'BUST' && ' 💥 BUST!'}
        {status === 'STAND' && ' ✋ STAND'}
      </div>
      {bet > 0 && (
        <div className="text-yellow-400 font-semibold text-xs">
          Bet: {bet}
        </div>
      )}
    </div>
  );
};
