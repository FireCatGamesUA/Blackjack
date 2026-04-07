import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/game';

export interface Card {
  suit: 'H' | 'D' | 'C' | 'S';
  value: string;
  numericValue: number;
  code: string;
}

export interface Hand {
  cards: Card[];
  score: number;
  isSoft: boolean;
  status: 'ACTIVE' | 'STAND' | 'BUST' | 'BLACKJACK' | 'DOUBLED';
}

export interface Player {
  userId: string;
  username: string;
  seatId: string;
  position: number;
  hand?: Hand;
  bet: number;
  isActive: boolean;
}

export interface TableState {
  id: string;
  name: string;
  minBet: number;
  maxBet: number;
  status: 'WAITING' | 'BETTING' | 'PLAYING' | 'DEALER_TURN' | 'SETTLING';
  seats: Array<{
    position: number;
    isActive: boolean;
    currentBet: number;
    user: { id: string; username: string } | null;
  }>;
  dealerCard1?: Card;
  dealerCard2?: Card;
  dealerScore?: number;
  currentPlayerSeatId?: string | null;
}

interface GameState {
  // Auth
  user: { id: string; username: string; email: string } | null;
  token: string | null;
  wallet: { balance: number; currency: string } | null;
  
  // Game
  socket: Socket | null;
  isConnected: boolean;
  currentTable: TableState | null;
  myPosition: number | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  connectSocket: () => void;
  disconnectSocket: () => void;
  joinTable: (tableId: string, position: number) => Promise<void>;
  leaveTable: (tableId: string) => Promise<void>;
  placeBet: (tableId: string, amount: number) => Promise<void>;
  playerAction: (tableId: string, action: 'HIT' | 'STAND' | 'DOUBLE' | 'INSURANCE') => Promise<void>;
  setCurrentTable: (table: TableState | null) => void;
  setMyPosition: (position: number | null) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  user: null,
  token: null,
  wallet: null,
  socket: null,
  isConnected: false,
  currentTable: null,
  myPosition: null,

  login: async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!res.ok) throw new Error('Login failed');
    
    const data = await res.json();
    set({ 
      user: data.user, 
      token: data.token, 
      wallet: data.wallet 
    });
    localStorage.setItem('token', data.token);
  },

  register: async (email: string, username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    });
    
    if (!res.ok) throw new Error('Registration failed');
    
    const data = await res.json();
    set({ 
      user: data.user, 
      token: data.token,
      wallet: { balance: 1000, currency: 'COIN' }
    });
    localStorage.setItem('token', data.token);
  },

  logout: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    set({ user: null, token: null, wallet: null, socket: null, currentTable: null, myPosition: null });
    localStorage.removeItem('token');
  },

  connectSocket: () => {
    const { token } = get();
    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', (data) => {
      console.log('Authenticated via WebSocket', data);
      set({ isConnected: true, wallet: data.wallet });
    });

    socket.on('table_update', (tableState: TableState) => {
      console.log('Table update:', tableState);
      set({ currentTable: tableState });
    });

    socket.on('error', (error: { message: string }) => {
      console.error('WebSocket error:', error.message);
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  joinTable: async (tableId: string, position: number) => {
    const { socket } = get();
    if (!socket) throw new Error('Not connected');
    
    return new Promise((resolve, reject) => {
      socket.emit('join_table', { tableId, position });
      
      socket.once('table_joined', () => resolve());
      socket.once('error', reject);
    });
  },

  leaveTable: async (tableId: string) => {
    const { socket } = get();
    if (!socket) return;
    
    socket.emit('leave_table', { tableId });
    set({ currentTable: null, myPosition: null });
  },

  placeBet: async (tableId: string, amount: number) => {
    const { socket } = get();
    if (!socket) throw new Error('Not connected');
    
    return new Promise((resolve, reject) => {
      socket.emit('place_bet', { tableId, amount });
      
      socket.once('bet_placed', (data) => {
        set((state) => ({ 
          wallet: state.wallet ? { ...state.wallet, balance: data.newBalance } : null 
        }));
        resolve();
      });
      socket.once('error', reject);
    });
  },

  playerAction: async (tableId: string, action: 'HIT' | 'STAND' | 'DOUBLE' | 'INSURANCE') => {
    const { socket } = get();
    if (!socket) throw new Error('Not connected');
    
    return new Promise((resolve, reject) => {
      socket.emit('player_action', { tableId, action });
      
      socket.once('action_processed', resolve);
      socket.once('error', reject);
    });
  },

  setCurrentTable: (table: TableState | null) => {
    set({ currentTable: table });
  },

  setMyPosition: (position: number | null) => {
    set({ myPosition: position });
  },
}));
