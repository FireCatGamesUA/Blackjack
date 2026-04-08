import { Module } from '@nestjs/common';
import { TableModule } from './table/table.module';
import { WalletModule } from './wallet/wallet.module';
import { AuthModule } from './auth/auth.module';
import { GameGateway } from './game.gateway';

@Module({
  imports: [TableModule, WalletModule, AuthModule],
  providers: [GameGateway],
})
export class GatewayModule {}
