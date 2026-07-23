import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.operation.findMany({
      include: { instrument: true },
      orderBy: { date: 'desc' },
    });
  }
}
