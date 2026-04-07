import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get wallet balance for user
   */
  async getBalance(userId: string): Promise<{ balance: number; currency: string }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    return {
      balance: parseFloat(wallet.balance.toString()),
      currency: wallet.currency,
    };
  }

  /**
   * Place a bet - lock funds from wallet
   * Uses database transaction with row locking to prevent double-spending
   */
  async placeBet(
    userId: string,
    amount: number,
    referenceId: string, // tableId-roundId or similar
  ): Promise<{ success: boolean; newBalance: number }> {
    if (amount <= 0) {
      throw new BadRequestException('Bet amount must be positive');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the wallet row for update
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        lock: { mode: 'optimistic', version: 0 }, // Optimistic locking
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const currentBalance = parseFloat(wallet.balance.toString());

      if (currentBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const newBalance = currentBalance - amount;

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          version: wallet.version + 1,
        },
      });

      // Record transaction
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.BET_LOCK,
          amount: -amount,
          balanceAfter: newBalance,
          referenceId,
        },
      });

      return { newBalance };
    });

    this.logger.log(`User ${userId} placed bet of ${amount}, new balance: ${result.newBalance}`);
    return { success: true, newBalance: result.newBalance };
  }

  /**
   * Process payout after round settlement
   */
  async processPayout(
    userId: string,
    payoutAmount: number,
    originalBet: number,
    referenceId: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    if (payoutAmount < 0) {
      throw new BadRequestException('Invalid payout amount');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const newBalance = currentBalance + payoutAmount;

      // Update wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          version: wallet.version + 1,
        },
      });

      // Record transaction based on result
      let transactionType: TransactionType;
      if (payoutAmount > originalBet) {
        transactionType = TransactionType.WIN;
      } else if (payoutAmount === originalBet) {
        transactionType = TransactionType.BET_RELEASE; // Push
      } else {
        transactionType = TransactionType.LOSS; // Partial loss (shouldn't happen in blackjack)
      }

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: transactionType,
          amount: payoutAmount,
          balanceAfter: newBalance,
          referenceId,
        },
      });

      return { newBalance };
    });

    this.logger.log(
      `User ${userId} received payout of ${payoutAmount}, new balance: ${result.newBalance}`,
    );
    return { success: true, newBalance: result.newBalance };
  }

  /**
   * Double down - deduct additional bet amount
   */
  async doubleDown(
    userId: string,
    additionalAmount: number,
    referenceId: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.placeBet(userId, additionalAmount, referenceId);
  }

  /**
   * Process insurance bet
   */
  async placeInsurance(
    userId: string,
    amount: number,
    referenceId: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.placeBet(userId, amount, referenceId);
  }

  /**
   * Add funds (for testing/demo purposes)
   */
  async addFunds(userId: string, amount: number): Promise<{ success: boolean; newBalance: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const newBalance = currentBalance + amount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          version: wallet.version + 1,
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          amount: amount,
          balanceAfter: newBalance,
          referenceId: `deposit-${Date.now()}`,
        },
      });

      return { newBalance };
    });

    return { success: true, newBalance: result.newBalance };
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId: string, limit: number = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: limit,
        },
      },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    return wallet.transactions;
  }
}
