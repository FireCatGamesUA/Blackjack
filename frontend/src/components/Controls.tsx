'use client';

import React from 'react';

interface ChipProps {
  value: number;
  onClick: () => void;
  disabled?: boolean;
}

export const Chip: React.FC<ChipProps> = ({ value, onClick, disabled }) => {
  const getChipClass = (val: number) => {
    switch (val) {
      case 10: return 'chip-10';
      case 25: return 'chip-25';
      case 50: return 'chip-50';
      case 100: return 'chip-100';
      case 500: return 'chip-500';
      default: return 'bg-gray-600';
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`chip ${getChipClass(value)} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {value}
    </button>
  );
};

interface BettingControlsProps {
  minBet: number;
  maxBet: number;
  currentBet: number;
  balance: number;
  onPlaceBet: (amount: number) => void;
  onStartRound?: () => void;
  disabled?: boolean;
}

export const BettingControls: React.FC<BettingControlsProps> = ({
  minBet,
  maxBet,
  currentBet,
  balance,
  onPlaceBet,
  onStartRound,
  disabled,
}) => {
  const chipValues = [10, 25, 50, 100, 500];

  const handleChipClick = (value: number) => {
    if (currentBet + value <= maxBet && currentBet + value <= balance) {
      onPlaceBet(currentBet + value);
    }
  };

  const canStart = currentBet >= minBet;

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-black/30 rounded-xl">
      <div className="text-white font-semibold">
        Current Bet: <span className="text-yellow-400 text-xl">{currentBet}</span>
        {currentBet > 0 && (
          <button
            onClick={() => onPlaceBet(0)}
            className="ml-4 text-red-400 hover:text-red-300 text-sm underline"
          >
            Clear
          </button>
        )}
      </div>
      
      <div className="flex gap-3">
        {chipValues.map((value) => (
          <Chip
            key={value}
            value={value}
            onClick={() => handleChipClick(value)}
            disabled={disabled || currentBet + value > maxBet || currentBet + value > balance}
          />
        ))}
      </div>

      {onStartRound && (
        <button
          onClick={onStartRound}
          disabled={!canStart || disabled}
          className={`px-8 py-3 rounded-lg font-bold text-lg transition ${
            canStart && !disabled
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {currentBet >= minBet ? 'DEAL CARDS' : `Min bet: ${minBet}`}
        </button>
      )}
    </div>
  );
};

interface ActionButtonsProps {
  onHit: () => void;
  onStand: () => void;
  onDouble?: () => void;
  onInsurance?: () => void;
  canDouble?: boolean;
  canInsurance?: boolean;
  disabled?: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onHit,
  onStand,
  onDouble,
  onInsurance,
  canDouble = false,
  canInsurance = false,
  disabled,
}) => {
  return (
    <div className="flex gap-3 flex-wrap justify-center">
      <button onClick={onHit} disabled={disabled} className="btn-hit">
        HIT
      </button>
      <button onClick={onStand} disabled={disabled} className="btn-stand">
        STAND
      </button>
      {onDouble && (
        <button 
          onClick={onDouble} 
          disabled={disabled || !canDouble} 
          className={`btn-double ${!canDouble ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          DOUBLE
        </button>
      )}
      {onInsurance && (
        <button 
          onClick={onInsurance} 
          disabled={disabled || !canInsurance} 
          className={`btn-insurance ${!canInsurance ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          INSURANCE
        </button>
      )}
    </div>
  );
};
