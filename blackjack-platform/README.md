# 🎰 Blackjack Platform - Production-Ready Online Casino

A full-stack, real-time multiplayer Blackjack platform with in-game currency, built with NestJS, PostgreSQL, Socket.IO, and Next.js.

## 🏗 Architecture

```
blackjack-platform/
├── backend/                 # NestJS API + WebSocket Server
│   ├── src/
│   │   ├── auth/           # JWT Authentication
│   │   ├── user/           # User management
│   │   ├── wallet/         # Virtual currency & transactions
│   │   ├── game/           # Game engine (cards, hands, rules)
│   │   ├── table/          # Table management
│   │   ├── gateway/        # WebSocket gateway
│   │   └── prisma/         # Database client
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── Dockerfile
├── frontend/               # Next.js React App
├── docker-compose.yml      # Full stack deployment
└── README.md
```

## 🎮 Features

### Core Blackjack Rules
- ✅ Dealer stands on soft 17
- ✅ Blackjack pays 3:2
- ✅ Insurance (when dealer shows Ace)
- ✅ Actions: Hit, Stand, Double Down
- ✅ Multiple deck shoe (6 decks default)
- ✅ Server-side shuffle (Fisher-Yates)

### Multiplayer Tables
- 1-7 players per table
- Fixed seating positions
- Real-time updates via WebSocket
- Spectator support

### Economy System
- Virtual currency (COIN)
- Starting bonus: 1000 coins
- Daily rewards: 100 coins
- Secure transactions with database locking
- Full transaction history

### Security
- Server-authoritative game logic
- JWT authentication
- Database transactions prevent double-spending
- Input validation on all endpoints
- WebSocket authentication

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Option 1: Docker (Recommended)

```bash
cd blackjack-platform

# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- WebSocket: ws://localhost:4000/game

### Option 2: Local Development

#### 1. Setup Database
```bash
docker run -d \
  --name blackjack-db \
  -e POSTGRES_USER=blackjack \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=blackjack \
  -p 5432:5432 \
  postgres:15-alpine
```

#### 2. Install & Run Backend
```bash
cd backend

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start development server
npm run start:dev
```

Backend runs on: http://localhost:4000

#### 3. Install & Run Frontend
```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:4000/game" >> .env.local

# Start development server
npm run dev
```

Frontend runs on: http://localhost:3000

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login user |
| GET | `/auth/profile` | Get user profile (JWT required) |
| POST | `/auth/daily-reward` | Claim daily bonus (JWT required) |

### Tables
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tables` | List all tables |
| POST | `/tables` | Create new table (JWT required) |
| GET | `/tables/:id` | Get table state |
| POST | `/tables/:id/join` | Join table (JWT required) |
| POST | `/tables/:id/leave` | Leave table (JWT required) |
| POST | `/tables/:id/bet` | Place bet (JWT required) |
| POST | `/tables/:id/start` | Start round (JWT required) |

## 🔌 WebSocket Events

### Client → Server
```javascript
// Authenticate
socket.emit('authenticate', { token: 'jwt-token' });

// Join table
socket.emit('join_table', { tableId: 'uuid', position: 0 });

// Leave table
socket.emit('leave_table', { tableId: 'uuid' });

// Place bet
socket.emit('place_bet', { tableId: 'uuid', amount: 100 });

// Player actions
socket.emit('player_action', { tableId: 'uuid', action: 'HIT' });
socket.emit('player_action', { tableId: 'uuid', action: 'STAND' });
socket.emit('player_action', { tableId: 'uuid', action: 'DOUBLE' });

// Chat (bonus)
socket.emit('chat_message', { tableId: 'uuid', message: 'Good luck!' });
```

### Server → Client
```javascript
// Authentication result
socket.on('authenticated', (data) => { ... });

// Table updates
socket.on('table_update', (state) => { ... });
socket.on('table_joined', (data) => { ... });
socket.on('table_left', (data) => { ... });

// Game events
socket.on('round_started', (data) => { ... });
socket.on('bet_placed', (data) => { ... });
socket.on('action_processed', (data) => { ... });

// Errors
socket.on('error', (data) => { ... });
```

## 🗄 Database Schema

Key entities:
- **User**: Account credentials
- **Wallet**: Virtual currency balance
- **Transaction**: All money movements (bets, wins, deposits)
- **GameTable**: Blackjack table configuration
- **Seat**: Player positions at table
- **GameRound**: Individual game rounds
- **GameRoundPlayer**: Player participation in round
- **PlayerHand**: Cards and scores

## 🎲 Game Flow

1. **Lobby**: Player browses available tables
2. **Join**: Player selects seat (0-6)
3. **Betting Phase**: Players place bets (min-max limits)
4. **Deal**: 2 cards to each player, 2 to dealer (1 hidden)
5. **Player Turns**: Sequential actions (Hit/Stand/Double)
6. **Dealer Turn**: Dealer plays (stands on soft 17)
7. **Settlement**: Calculate results, process payouts
8. **Reset**: New betting phase begins

## 🔒 Security Features

1. **Server-Authoritative Logic**
   - All game calculations on server
   - Clients only send intents (HIT, STAND, etc.)
   - No card data sent until revealed

2. **Financial Security**
   - Database transactions with row locking
   - Optimistic concurrency control
   - Complete audit trail via Transaction table

3. **Authentication**
   - JWT tokens for API calls
   - WebSocket authentication handshake
   - Token expiration (7 days default)

4. **Input Validation**
   - class-validator on all DTOs
   - Bet limit enforcement
   - Turn order validation

## 📊 Example Request/Response

### Register & Login
```bash
# Register
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"player@example.com","username":"Player1","password":"secure123"}'

# Response: { user: {...}, token: "eyJhbG..." }

# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"player@example.com","password":"secure123"}'
```

### Place Bet
```bash
curl -X POST http://localhost:4000/tables/{tableId}/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"amount": 100}'
```

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS (Node.js) |
| Database | PostgreSQL 15 |
| ORM | Prisma |
| WebSocket | Socket.IO |
| Auth | JWT + Passport |
| Frontend | Next.js + React |
| State | Zustand/Redux |
| Styling | Tailwind CSS |
| Deployment | Docker Compose |

## 📈 Scaling Considerations

For production deployment:

1. **Horizontal Scaling**
   - Use Redis adapter for Socket.IO
   - Session affinity (sticky sessions)
   - Load balancer (nginx/HAProxy)

2. **Database**
   - Connection pooling (PgBouncer)
   - Read replicas for analytics
   - Partitioning for transaction history

3. **Caching**
   - Redis for game state
   - CDN for static assets

4. **Monitoring**
   - Prometheus + Grafana
   - Structured logging (Winston/Pino)
   - Error tracking (Sentry)

## 📝 License

MIT License - Educational/Demo purposes only. Not for real-money gambling.

---

**⚠️ Disclaimer**: This is a demo project using virtual currency only. Do not use for real-money gambling without proper licensing, legal compliance, and additional security measures.
