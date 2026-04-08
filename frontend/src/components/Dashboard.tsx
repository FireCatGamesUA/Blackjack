'use client';

import React from 'react';
import { useGameStore } from '../store/gameStore';
import { GameTable } from './GameTable';
import { useRouter } from 'next/navigation';

export const Dashboard: React.FC = () => {
  const { user, wallet, connectSocket, disconnectSocket, currentTable, myPosition, setCurrentTable, logout } = useGameStore();
  const [tables, setTables] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }

    // Connect WebSocket
    connectSocket();

    // Fetch tables
    fetchTables();

    return () => {
      disconnectSocket();
    };
  }, []);

  const fetchTables = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/tables`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTable = async (tableId: string, position: number) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/tables/${tableId}/join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ position }),
        }
      );

      if (res.ok) {
        // Fetch updated table state
        const tableRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/tables/${tableId}`
        );
        if (tableRes.ok) {
          const tableData = await tableRes.json();
          setCurrentTable(tableData);
        }
      }
    } catch (err) {
      console.error('Failed to join table:', err);
    }
  };

  const handleLeaveTable = async () => {
    if (!currentTable) return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/tables/${currentTable.id}/leave`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      setCurrentTable(null);
      fetchTables();
    } catch (err) {
      console.error('Failed to leave table:', err);
    }
  };

  const handleCreateTable = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/tables`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: `Table ${Math.floor(Math.random() * 1000)}`,
            minBet: 10,
            maxBet: 1000,
          }),
        }
      );

      if (res.ok) {
        fetchTables();
      }
    } catch (err) {
      console.error('Failed to create table:', err);
    }
  };

  if (currentTable) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-black p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="text-white">
              <h1 className="text-2xl font-bold">{currentTable.name}</h1>
              <p className="text-white/70 text-sm">
                {user?.username} • Balance: {wallet?.balance} {wallet?.currency}
              </p>
            </div>
            <button
              onClick={handleLeaveTable}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
            >
              Leave Table
            </button>
          </div>
          
          <GameTable table={currentTable} myPosition={myPosition ?? -1} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-black p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🎰 Blackjack Lobby</h1>
            <p className="text-white/70">
              Welcome, {user?.username}! • Balance: <span className="text-green-400 font-bold">{wallet?.balance}</span> {wallet?.currency}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreateTable}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Create Table
            </button>
            <button
              onClick={logout}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tables List */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-4">Available Tables</h2>
          
          {loading ? (
            <div className="text-white/70 text-center py-8">Loading tables...</div>
          ) : tables.length === 0 ? (
            <div className="text-white/70 text-center py-8">
              No tables available. Create one to start playing!
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => {
                const occupiedSeats = table.seats.filter((s: any) => s.isActive).length;
                const hasEmptySeat = occupiedSeats < 7;
                
                return (
                  <div
                    key={table.id}
                    className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-yellow-400/50 transition"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-white font-bold text-lg">{table.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        table.status === 'BETTING' ? 'bg-green-600' :
                        table.status === 'PLAYING' ? 'bg-yellow-600' : 'bg-gray-600'
                      } text-white`}>
                        {table.status}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-white/70 text-sm mb-4">
                      <div>Min Bet: <span className="text-yellow-400">{table.minBet}</span></div>
                      <div>Max Bet: <span className="text-yellow-400">{table.maxBet}</span></div>
                      <div>Players: {occupiedSeats}/7</div>
                    </div>
                    
                    <button
                      onClick={() => {
                        const emptySeatIndex = table.seats.findIndex((s: any) => !s.isActive);
                        if (emptySeatIndex >= 0) {
                          handleJoinTable(table.id, emptySeatIndex);
                        }
                      }}
                      disabled={!hasEmptySeat}
                      className={`w-full py-2 rounded-lg font-semibold transition ${
                        hasEmptySeat
                          ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {hasEmptySeat ? 'Join Table' : 'Full'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Game Rules */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">📋 How to Play</h2>
          <div className="grid md:grid-cols-2 gap-4 text-white/70 text-sm">
            <div>
              <h3 className="font-semibold text-white mb-2">Game Flow:</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li>Join a table and select a seat</li>
                <li>Place your bet during betting phase</li>
                <li>Receive 2 cards, dealer gets 2 (1 hidden)</li>
                <li>Choose: Hit, Stand, Double, or Insurance</li>
                <li>Dealer plays after all players finish</li>
                <li>Win = 1:1, Blackjack = 3:2, Push = bet back</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Rules:</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Dealer stands on soft 17</li>
                <li>Blackjack pays 3:2</li>
                <li>Insurance pays 2:1</li>
                <li>Double down on first two cards</li>
                <li>6-deck shoe, reshuffled at 70%</li>
                <li>Maximum 7 players per table</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
