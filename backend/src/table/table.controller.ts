import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TableService, CreateTableDto } from './table.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tables')
export class TableController {
  constructor(private tableService: TableService) {}

  @Get()
  async getTables() {
    return this.tableService.getTables();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTable(@Body() dto: CreateTableDto) {
    return this.tableService.createTable(dto);
  }

  @Get(':id')
  async getTableState(@Param('id') id: string) {
    return this.tableService.getTableState(id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async joinTable(
    @Param('id') tableId: string,
    @Body() body: { position: number },
    @Request() req,
  ) {
    return this.tableService.joinTable(
      tableId,
      req.user.id,
      req.user.username,
      body.position,
    );
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leaveTable(@Param('id') tableId: string, @Request() req) {
    return this.tableService.leaveTable(tableId, req.user.id);
  }

  @Post(':id/bet')
  @UseGuards(JwtAuthGuard)
  async placeBet(
    @Param('id') tableId: string,
    @Body() body: { amount: number },
    @Request() req,
  ) {
    return this.tableService.placeBet(tableId, req.user.id, body.amount);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  async startRound(@Param('id') tableId: string) {
    return this.tableService.startRound(tableId);
  }
}
