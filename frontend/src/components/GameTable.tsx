'use client';

import React from 'react';
import { useGameStore, TableState } from '../store/gameStore';
import { Card as CardComponent, PlayerHand } from './Card';
import { BettingControls, ActionButtons } from './Controls';

interface GameTableProps {
  table: TableState;
  myPosition: number | null;
}

export const GameTable: React.FC<GameTableProps> = ({ table, myPosition }) => {
  const { playerAction, placeBet, wallet } = useGameStore();
  const [currentBet, setCurrentBet] = React.useState(0);
  const [message, setMessage] = React.useState('');

  const isMyTurn = table.currentPlayerSeatId && myPosition !== null;
  const canDouble = myPosition !== null && table.status === 'PLAYER_TURN';
  const dealerShowsAce = table.dealerCard1?.value === 'A';

  const handlePlaceBet = async (amount: number) => {
    try {
      if (amount === 0) {
        setCurrentBet(0);
        return;
      }
      await placeBet(table.id, amount);
      setCurrentBet(amount);
      setMessage('');
    } catch (err: any) {
      setMessage(err.message || 'Failed to place bet');
    }
  };

  const handleStartRound = async () => {
    // This would typically be handled by the server automatically
    // or by a dedicated host/dealer button
    setMessage('Waiting for other players...');
  };

  const handleAction = async (action: 'HIT' | 'STAND' | 'DOUBLE' | 'INSURANCE') => {
    try {
      await playerAction(table.id, action);
      setMessage('');
    } catch (err: any) {
      setMessage(err.message || 'Action failed');
    }
  };

  const getSeatPosition = (index: number) => {
    // Position seats in a semi-circle
    const positions = [
      'bottom-4 left-8',    // Seat 0
      'bottom-4 left-1/4',  // Seat 1
      'bottom-4 left-1/2',  // Seat 2
      'bottom-4 left-3/4',  // Seat 3
      'bottom-4 right-8',   // Seat 4
      'top-1/2 left-4 -translate-y-1/2',  // Seat 5
      'top-1/4 left-1/2 -translate-x-1/2', // Seat 6
    ];
    return positions[index] || '';
  };

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      {/* Casino Table */}
      <div className="casino-table aspect-[2/1] relative p-8">
        
        {/* Dealer Area */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <div className="text-white font-bold text-lg drop-shadow-lg">DEALER</div>
          <div className="flex gap-2">
            {table.dealerCard1 ? (
              <CardComponent card={table.dealerCard1} />
            ) : (
              <div className="w-[60px] h-[84px]" />
            )}
            {table.status !== 'BETTING' && table.dealerCard2 && (
              <CardComponent 
                card={table.dealerCard2} 
                hidden={table.status === 'PLAYER_TURN'}
              />
            )}
          </div>
          {table.dealerScore !== undefined && table.status !== 'PLAYER_TURN' && (
            <div className="text-white font-semibold bg-black/50 px-3 py-1 rounded">
              Score: {table.dealerScore}
            </div>
          )}
        </div>

        {/* Table Info */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-white/70 font-semibold text-sm">{table.name}</div>
          <div className="text-white/50 text-xs">Min: {table.minBet} | Max: {table.maxBet}</div>
          <div className="text-yellow-400 font-bold mt-2 capitalize">{table.status.replace('_', ' ')}</div>
        </div>

        {/* Player Seats */}
        {table.seats.map((seat, index) => {
          const isMySeat = myPosition === index;
          const isActive = seat.isActive;
          
          return (
            <div
              key={index}
              className={`absolute ${getSeatPosition(index)} seat ${
                !isActive ? 'empty' : ''
              } ${isMyTurn && isMySeat ? 'active' : ''}`}
            >
              {isActive ? (
                <>
                  <div className="text-white font-semibold text-sm mb-2 whitespace-nowrap">
                    {seat.user?.username}
                    {isMySeat && ' (You)'}
                  </div>
                  
                  {seat.currentBet > 0 && (
                    <div className="text-yellow-400 font-bold text-xs mb-1">
                      Bet: {seat.currentBet}
                    </div>
                  )}
                  
                  {/* Cards will be shown via game state updates */}
                  {!seat.user && (
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold">
                      Join
                    </button>
                  )}
                </>
              ) : (
                <div className="w-20 h-20 border-2 border-dashed border-white/30 rounded-full flex items-center justify-center text-white/30 text-sm">
                  Empty
                </div>
              )}
              
              {isMyTurn && isMySeat && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-yellow-400 font-bold animate-pulse">
                  Your Turn!
                </div>
              )}
            </div>
          );
        })}

        {/* Message Display */}
        {message && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
            {message}
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="mt-6 flex flex-col items-center gap-4">
        {wallet && (
          <div className="text-white font-semibold bg-black/50 px-4 py-2 rounded-lg">
            Balance: <span className="text-green-400">{wallet.balance}</span> {wallet.currency}
          </div>
        )}

        {table.status === 'BETTING' && myPosition !== null && (
          <BettingControls
            minBet={table.minBet}
            maxBet={table.maxBet}
            currentBet={currentBet}
            balance={wallet?.balance || 0}
            onPlaceBet={handlePlaceBet}
            onStartRound={handleStartRound}
          />
        )}

        {table.status === 'PLAYER_TURN' && isMyTurn && (
          <ActionButtons
            onHit={() => handleAction('HIT')}
            onStand={() => handleAction('STAND')}
            onDouble={() => handleAction('DOUBLE')}
            onInsurance={() => handleAction('INSURANCE')}
            canDouble={canDouble}
            canInsurance={dealerShowsAce && table.status === 'PLAYER_TURN'}
          />
        )}

        {table.status === 'DEALER_TURN' && (
          <div className="text-white font-semibold text-lg animate-pulse">
            Dealer is playing...
          </div>
        )}

        {table.status === 'SETTLING' && (
          <div className="text-yellow-400 font-semibold text-lg">
            Settling round...
          </div>
        )}
      </div>
    </div>
  );
};
