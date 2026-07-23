import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseXtbWorkbook, ParseError } from './xtb-parser';

export interface ImportSummary {
  created: number;
  skippedExisting: number;
  errors: ParseError[];
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importXtbFile(buffer: Buffer): Promise<ImportSummary> {
    const { operations, errors } = parseXtbWorkbook(buffer);

    const instrumentCache = new Map<string, string>();
    let created = 0;
    let skippedExisting = 0;

    for (const op of operations) {
      let instrumentId = instrumentCache.get(op.symbol);
      if (!instrumentId) {
        const instrument = await this.upsertInstrument(op.symbol, op.currency);
        instrumentId = instrument.id;
        instrumentCache.set(op.symbol, instrumentId);
      }

      const existing = await this.prisma.operation.findUnique({
        where: { externalId: op.externalId },
      });

      if (existing) {
        skippedExisting++;
        continue;
      }

      await this.prisma.operation.create({
        data: {
          externalId: op.externalId,
          type: op.type,
          date: op.date,
          quantity: op.quantity,
          price: op.price,
          commission: op.commission,
          currency: op.currency,
          instrumentId,
        },
      });
      created++;
    }

    return { created, skippedExisting, errors };
  }

  private async upsertInstrument(symbol: string, currency: string) {
    const market = symbol.includes('.') ? symbol.split('.').pop()! : null;
    return this.prisma.instrument.upsert({
      where: { symbol },
      update: {},
      create: {
        symbol,
        name: symbol,
        type: 'STOCK',
        market,
        currency,
      },
    });
  }
}
