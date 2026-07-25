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

// Cada venta (SELL) que cerró — total o parcialmente — una posición, con el
// cálculo desglosado del P&L realizado que aportó.
export interface RealizedEventDto {
  externalId: string;
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  date: string;
  quantity: string;
  sellPrice: string;
  averageCost: string;
  commission: string;
  realizedPnL: string;
}

// Cada dividendo cobrado.
export interface DividendEventDto {
  externalId: string;
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  date: string;
  amount: string;
}

// Peso de una posición (o mercado) sobre el total invertido.
export interface AllocationSliceDto {
  label: string; // symbol o mercado
  market: string | null;
  costBasis: string;
  weight: number; // porcentaje 0..100
}

export interface DiversificationDto {
  currency: string;
  totalInvested: string;
  byPosition: AllocationSliceDto[];
  byMarket: AllocationSliceDto[];
  concentration: {
    positionsCount: number;
    topWeight: number; // % de la posición más grande
    top3Weight: number; // % de las 3 más grandes
    hhi: number; // índice Herfindahl-Hirschman (0..1); mayor = más concentrado
    effectivePositions: number; // 1/hhi: nº de posiciones "equivalentes" equiponderadas
  };
}

// Un punto mensual de la evolución del portafolio (derivado de las operaciones,
// sin precios de mercado): capital invertido a costo, y P&L realizado y
// dividendos acumulados hasta el fin de ese mes.
export interface HistoryPointDto {
  month: string; // 'YYYY-MM'
  invested: string;
  realizedPnL: string;
  dividends: string;
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

interface ComputationResult {
  accumulators: Map<string, InstrumentAccumulator>;
  realizedEvents: RealizedEventDto[];
  dividendEvents: DividendEventDto[];
}

// Orden de proceso dentro de un mismo instante: una compra debe procesarse
// antes que una venta para que nunca se venda algo que aún no se compró.
const TYPE_ORDER: Record<string, number> = { BUY: 0, SELL: 1, DIVIDEND: 2 };

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getPositions(): Promise<PositionDto[]> {
    const { accumulators } = await this.compute();
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
    const { accumulators } = await this.compute();

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

  // Detalle de las ventas que compusieron el P&L realizado, más reciente primero.
  async getRealizedEvents(): Promise<RealizedEventDto[]> {
    const { realizedEvents } = await this.compute();
    return realizedEvents.sort((a, b) => b.date.localeCompare(a.date));
  }

  // Detalle de los dividendos cobrados, más reciente primero.
  async getDividendEvents(): Promise<DividendEventDto[]> {
    const { dividendEvents } = await this.compute();
    return dividendEvents.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Diversificación y concentración del portafolio, sobre el costo base de las
   * posiciones abiertas (no requiere precios de mercado). Devuelve el peso de
   * cada posición y de cada mercado, más indicadores de concentración.
   */
  async getDiversification(): Promise<DiversificationDto> {
    const { accumulators } = await this.compute();

    const open = [...accumulators.values()]
      .filter((acc) => acc.quantity.greaterThan(EPSILON))
      .map((acc) => ({
        symbol: acc.symbol,
        market: acc.market,
        costBasis: acc.quantity.times(acc.averageCost),
      }));

    const currency =
      [...accumulators.values()][0]?.currency ?? 'USD';
    const total = open.reduce((sum, p) => sum.plus(p.costBasis), new D(0));
    const weightPct = (cb: DecimalValue) =>
      total.isZero() ? 0 : Number(cb.dividedBy(total).times(100));

    const byPosition: AllocationSliceDto[] = open
      .map((p) => ({
        label: p.symbol,
        market: p.market,
        costBasis: p.costBasis.toString(),
        weight: weightPct(p.costBasis),
      }))
      .sort((a, b) => Number(b.costBasis) - Number(a.costBasis));

    const marketTotals = new Map<string, DecimalValue>();
    for (const p of open) {
      const key = p.market ?? '—';
      marketTotals.set(key, (marketTotals.get(key) ?? new D(0)).plus(p.costBasis));
    }
    const byMarket: AllocationSliceDto[] = [...marketTotals.entries()]
      .map(([market, cb]) => ({
        label: market,
        market,
        costBasis: cb.toString(),
        weight: weightPct(cb),
      }))
      .sort((a, b) => Number(b.costBasis) - Number(a.costBasis));

    // Fracciones (0..1) para los indicadores de concentración.
    const fractions = open
      .map((p) => (total.isZero() ? 0 : Number(p.costBasis.dividedBy(total))))
      .sort((a, b) => b - a);
    const hhi = fractions.reduce((s, f) => s + f * f, 0);
    const topWeight = (fractions[0] ?? 0) * 100;
    const top3Weight = fractions.slice(0, 3).reduce((s, f) => s + f, 0) * 100;

    return {
      currency,
      totalInvested: total.toString(),
      byPosition,
      byMarket,
      concentration: {
        positionsCount: open.length,
        topWeight,
        top3Weight,
        hhi,
        effectivePositions: hhi > 0 ? 1 / hhi : 0,
      },
    };
  }

  /**
   * Evolución mensual del portafolio derivada de las operaciones: capital
   * invertido a costo (costo base de lo que se tenía al fin de cada mes), y
   * P&L realizado y dividendos acumulados. No usa precios de mercado, así que
   * no es el valor de mercado del portafolio sino su "capital desplegado" y las
   * ganancias/ingresos ya materializados.
   */
  async getHistory(): Promise<HistoryPointDto[]> {
    const operations = await this.prisma.operation.findMany();

    // Orden cronológico global (compra antes que venta en el mismo instante).
    const ops = [...operations].sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    });

    const holdings = new Map<
      string,
      { quantity: DecimalValue; averageCost: DecimalValue }
    >();
    let realizedCum = new D(0);
    let dividendsCum = new D(0);

    const investedNow = () => {
      let sum = new D(0);
      for (const h of holdings.values()) {
        if (h.quantity.greaterThan(EPSILON)) {
          sum = sum.plus(h.quantity.times(h.averageCost));
        }
      }
      return sum;
    };

    // Snapshot por mes: el último estado dentro del mes queda como su valor.
    const byMonth = new Map<string, HistoryPointDto>();

    for (const op of ops) {
      const quantity = new D(op.quantity);
      const price = new D(op.price);
      const commission = new D(op.commission);
      const h = holdings.get(op.instrumentId) ?? {
        quantity: new D(0),
        averageCost: new D(0),
      };

      if (op.type === 'BUY') {
        const newQuantity = h.quantity.plus(quantity);
        const addedCost = quantity.times(price).plus(commission);
        const totalCost = h.averageCost.times(h.quantity).plus(addedCost);
        h.averageCost = newQuantity.isZero()
          ? new D(0)
          : totalCost.dividedBy(newQuantity);
        h.quantity = newQuantity;
      } else if (op.type === 'SELL') {
        realizedCum = realizedCum.plus(
          quantity.times(price.minus(h.averageCost)).minus(commission),
        );
        h.quantity = h.quantity.minus(quantity);
        if (h.quantity.abs().lessThanOrEqualTo(EPSILON)) {
          h.quantity = new D(0);
          h.averageCost = new D(0);
        }
      } else if (op.type === 'DIVIDEND') {
        dividendsCum = dividendsCum.plus(price);
      }
      holdings.set(op.instrumentId, h);

      const d = op.date;
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      byMonth.set(month, {
        month,
        invested: investedNow().toString(),
        realizedPnL: realizedCum.toString(),
        dividends: dividendsCum.toString(),
      });
    }

    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Recorre todas las operaciones agrupadas por instrumento, en orden
   * cronológico, aplicando costo promedio ponderado. Además de los
   * acumuladores por instrumento (cantidad neta, costo promedio, P&L
   * realizado, dividendos), captura el detalle evento por evento de cada
   * venta que generó P&L y cada dividendo cobrado. Todo se deriva de
   * `Operation`; no hay estado persistido.
   */
  private async compute(): Promise<ComputationResult> {
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
    const realizedEvents: RealizedEventDto[] = [];
    const dividendEvents: DividendEventDto[] = [];

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
          const averageCostAtSale = acc.averageCost;
          const eventPnL = quantity
            .times(price.minus(averageCostAtSale))
            .minus(commission);
          acc.realizedPnL = acc.realizedPnL.plus(eventPnL);

          realizedEvents.push({
            externalId: op.externalId,
            symbol: acc.symbol,
            name: acc.name,
            market: acc.market,
            currency: acc.currency,
            date: op.date.toISOString(),
            quantity: quantity.toString(),
            sellPrice: price.toString(),
            averageCost: averageCostAtSale.toString(),
            commission: commission.toString(),
            realizedPnL: eventPnL.toString(),
          });

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

          dividendEvents.push({
            externalId: op.externalId,
            symbol: acc.symbol,
            name: acc.name,
            market: acc.market,
            currency: acc.currency,
            date: op.date.toISOString(),
            amount: price.toString(),
          });
        }
      }

      accumulators.set(instrumentId, acc);
    }

    return { accumulators, realizedEvents, dividendEvents };
  }
}
