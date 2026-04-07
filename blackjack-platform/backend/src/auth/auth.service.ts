import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register a new user with wallet initialization
   */
  async register(registerDto: RegisterDto) {
    const { email, username, password } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new UnauthorizedException('Email or username already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user with wallet in transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
        },
      });

      // Initialize wallet with starting balance
      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 1000.0, // Starting bonus
        },
      });

      return newUser;
    });

    // Generate JWT token
    const token = this.generateToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    };
  }

  /**
   * Login user
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const token = this.generateToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      wallet: {
        balance: user.wallet?.balance || 0,
        currency: user.wallet?.currency || 'COIN',
      },
      token,
    };
  }

  /**
   * Validate user for JWT strategy
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      wallet: {
        balance: user.wallet?.balance || 0,
        currency: user.wallet?.currency || 'COIN',
      },
    };
  }

  /**
   * Validate JWT token (for WebSocket authentication)
   */
  async validateUserFromToken(token: string) {
    try {
      const jwt = require('@nestjs/jwt').JwtService;
      // In production, use proper JWT verification with secret
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      
      if (payload && payload.sub) {
        return this.validateUser(payload.sub);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get user profile with wallet
   */
  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: {
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      wallet: {
        balance: user.wallet?.balance || 0,
        currency: user.wallet?.currency || 'COIN',
        transactions: user.wallet?.transactions || [],
      },
      stats: await this.getUserStats(userId),
    };
  }

  /**
   * Get user game statistics
   */
  private async getUserStats(userId: string) {
    const totalRounds = await this.prisma.gameRoundPlayer.count({
      where: { userId },
    });

    const wins = await this.prisma.gameRoundPlayer.count({
      where: {
        userId,
        handStatus: 'WIN',
      },
    });

    const blackjacks = await this.prisma.gameRoundPlayer.count({
      where: {
        userId,
        isBlackjack: true,
      },
    });

    const totalWinnings = await this.prisma.gameRoundPlayer.aggregate({
      where: { userId },
      _sum: { payout: true },
    });

    return {
      totalRounds,
      wins,
      losses: totalRounds - wins,
      winRate: totalRounds > 0 ? ((wins / totalRounds) * 100).toFixed(2) : '0',
      blackjacks,
      totalWinnings: totalWinnings._sum.payout || 0,
    };
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string): string {
    return this.jwtService.sign({ sub: userId });
  }

  /**
   * Claim daily reward
   */
  async claimDailyReward(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastReward = await this.prisma.transaction.findFirst({
      where: {
        wallet: { userId },
        type: 'DAILY_REWARD',
        createdAt: { gte: today },
      },
    });

    if (lastReward) {
      throw new UnauthorizedException('Daily reward already claimed today');
    }

    const rewardAmount = 100; // Daily bonus

    const result = await this.prisma.$transaction(async (tx) => {
      // Update wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new UnauthorizedException('Wallet not found');
      }

      const newBalance = parseFloat(wallet.balance.toString()) + rewardAmount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DAILY_REWARD',
          amount: rewardAmount,
          balanceAfter: newBalance,
          referenceId: `daily-${userId}-${today.toISOString()}`,
        },
      });

      return { newBalance, transaction };
    });

    return {
      success: true,
      amount: rewardAmount,
      newBalance: result.newBalance,
    };
  }
}
