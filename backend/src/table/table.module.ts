import { Module } from '@nestjs/common';
import { TableService } from './table.service';
import { TableController } from './table.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameEngineService } from '../game/game-engine.service';

@Module({
  imports: [PrismaModule, WalletModule],
  providers: [TableService, GameEngineService],
  controllers: [TableController],
  exports: [TableService, GameEngineService],
})
export class TableModule {}
