import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const D = Prisma.Decimal;
type DecimalValue = Prisma.Decimal;

// Umbral por debajo del cual una cantidad se considera cero (XTB opera con
// fracciones, y tras compras/ventas pueden quedar residuos por redondeo).
const EPSILON = new D('0.00000001');

export interface PositionDto {
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  quantity: string;
  averageCost: string;
  costBasis: string;
  realizedPnL: string;
  dividendsCollected: string;
}

export interface PortfolioSummaryDto {
  currency: string;
  totalInvested: string;
  realizedPnL: string;
  dividendsCollected: string;
  openPositionsCount: number;
  instrumentsCount: number;
}

interface InstrumentAccumulator {
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  quantity: DecimalValue;
  averageCost: DecimalValue;
  realizedPnL: DecimalValue;
  dividendsCollected: DecimalValue;
}

// Orden de proceso dentro de un mismo instante: una compra debe procesarse
// antes que una venta para que nunca se venda algo que aún no se compró.
const TYPE_ORDER: Record<string, number> = { BUY: 0, SELL: 1, DIVIDEND: 2 };

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getPositions(): Promise<PositionDto[]> {
    const accumulators = await this.computeAccumulators();
    return [...accumulators.values()]
      .filter((acc) => acc.quantity.greaterThan(EPSILON))
      .map((acc) => ({
        symbol: acc.symbol,
        name: acc.name,
        market: acc.market,
        currency: acc.currency,
        quantity: acc.quantity.toString(),
        averageCost: acc.averageCost.toString(),
        costBasis: acc.quantity.times(acc.averageCost).toString(),
        realizedPnL: acc.realizedPnL.toString(),
        dividendsCollected: acc.dividendsCollected.toString(),
      }))
      .sort((a, b) => Number(b.costBasis) - Number(a.costBasis));
  }

  async getSummary(): Promise<PortfolioSummaryDto> {
    const accumulators = await this.computeAccumulators();

    let totalInvested = new D(0);
    let realizedPnL = new D(0);
    let dividendsCollected = new D(0);
    let openPositionsCount = 0;
    let currency = 'USD';

    for (const acc of accumulators.values()) {
      currency = acc.currency;
      realizedPnL = realizedPnL.plus(acc.realizedPnL);
      dividendsCollected = dividendsCollected.plus(acc.dividendsCollected);
      if (acc.quantity.greaterThan(EPSILON)) {
        totalInvested = totalInvested.plus(acc.quantity.times(acc.averageCost));
        openPositionsCount++;
      }
    }

    return {
      currency,
      totalInvested: totalInvested.toString(),
      realizedPnL: realizedPnL.toString(),
      dividendsCollected: dividendsCollected.toString(),
      openPositionsCount,
      instrumentsCount: accumulators.size,
    };
  }

  /**
   * Recorre todas las operaciones agrupadas por instrumento, en orden
   * cronológico, aplicando costo promedio ponderado. Devuelve el estado
   * final (cantidad neta, costo promedio, P&L realizado, dividendos) por
   * instrumento. Todo se deriva de `Operation`; no hay estado persistido.
   */
  private async computeAccumulators(): Promise<Map<string, InstrumentAccumulator>> {
    const operations = await this.prisma.operation.findMany({
      include: { instrument: true },
    });

    // Agrupar por instrumento.
    const grouped = new Map<string, typeof operations>();
    for (const op of operations) {
      const list = grouped.get(op.instrumentId) ?? [];
      list.push(op);
      grouped.set(op.instrumentId, list);
    }

    const accumulators = new Map<string, InstrumentAccumulator>();

    for (const [instrumentId, ops] of grouped) {
      ops.sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
      });

      const instrument = ops[0].instrument;
      const acc: InstrumentAccumulator = {
        symbol: instrument.symbol,
        name: instrument.name,
        market: instrument.market,
        currency: instrument.currency,
        quantity: new D(0),
        averageCost: new D(0),
        realizedPnL: new D(0),
        dividendsCollected: new D(0),
      };

      for (const op of ops) {
        const quantity = new D(op.quantity);
        const price = new D(op.price);
        const commission = new D(op.commission);

        if (op.type === 'BUY') {
          const newQuantity = acc.quantity.plus(quantity);
          // La comisión de compra se incorpora al costo de la posición.
          const addedCost = quantity.times(price).plus(commission);
          const totalCost = acc.averageCost.times(acc.quantity).plus(addedCost);
          acc.averageCost = newQuantity.isZero()
            ? new D(0)
            : totalCost.dividedBy(newQuantity);
          acc.quantity = newQuantity;
        } else if (op.type === 'SELL') {
          // P&L realizado = cantidad * (precio_venta - costo_promedio) - comisión.
          acc.realizedPnL = acc.realizedPnL.plus(
            quantity.times(price.minus(acc.averageCost)).minus(commission),
          );
          acc.quantity = acc.quantity.minus(quantity);
          // El costo promedio del remanente no cambia al vender; solo si la
          // posición se cierra por completo lo reiniciamos.
          if (acc.quantity.abs().lessThanOrEqualTo(EPSILON)) {
            acc.quantity = new D(0);
            acc.averageCost = new D(0);
          }
        } else if (op.type === 'DIVIDEND') {
          // En DIVIDEND, `price` guarda el monto total cobrado (quantity = 1).
          acc.dividendsCollected = acc.dividendsCollected.plus(price);
        }
      }

      accumulators.set(instrumentId, acc);
    }

    return accumulators;
  }
}
