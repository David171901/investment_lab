import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService, type QuoteDto } from '../quotes/quotes.service';
import { ProfilesService, type ProfileDto } from '../quotes/profiles.service';
import { Prisma } from '../../generated/prisma/client';
import { computeClosedCycles } from './closed-positions';

const D = Prisma.Decimal;
type DecimalValue = Prisma.Decimal;

// Umbral por debajo del cual una cantidad se considera cero (XTB opera con
// fracciones, y tras compras/ventas pueden quedar residuos por redondeo).
const EPSILON = new D('0.00000001');

// Por debajo de esta fracción del valor de mercado, el costo base se considera
// despreciable y no se reporta rendimiento porcentual. Ver `toPositionDto`.
const NEGLIGIBLE_COST_RATIO = new D('0.01');

export interface PositionDto {
  symbol: string;
  // Nombre de la empresa. Cae al `symbol` mientras el proveedor de perfiles no
  // haya respondido — el export de XTB no trae el nombre.
  name: string;
  // Logo servido por el proveedor. Null cuando el emisor no tiene uno.
  logoUrl: string | null;
  market: string | null;
  currency: string;
  quantity: string;
  averageCost: string;
  costBasis: string;
  realizedPnL: string;
  dividendsCollected: string;
  // Fase 3.5 — null cuando no hay cotización disponible para el instrumento
  // (sin clave del proveedor, símbolo sin cobertura, o fallo de la API).
  marketPrice: string | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
  returnPct: number | null;
  quoteAsOf: string | null;
  quoteStale: boolean;
}

export interface PortfolioSummaryDto {
  currency: string;
  totalInvested: string;
  realizedPnL: string;
  dividendsCollected: string;
  openPositionsCount: number;
  instrumentsCount: number;
  // Fase 3.5 — valuación a mercado. `marketValue` cubre solo las posiciones
  // con cotización; `positionsWithoutQuote` dice cuántas quedaron afuera para
  // que la UI no presente un total parcial como si fuera el total.
  marketValue: string | null;
  unrealizedPnL: string | null;
  totalPnL: string | null;
  returnPct: number | null;
  positionsWithQuote: number;
  positionsWithoutQuote: number;
  quotesConfigured: boolean;
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

// Un ciclo completo de compra-venta ya cerrado: de la primera compra que abrió
// la posición a la venta que la dejó en cantidad cero. Si una empresa se
// compró y vendió por completo más de una vez, aparece una fila por cada vez
// (ver `closed-positions.ts` para el criterio de "ciclo").
export interface ClosedPositionDto {
  symbol: string;
  name: string;
  logoUrl: string | null;
  market: string | null;
  currency: string;
  openDate: string;
  closeDate: string;
  quantity: string;
  averageBuyPrice: string;
  averageSellPrice: string;
  realizedPnL: string;
  returnPct: number | null;
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

// Base sobre la que se calculan los pesos: el costo de compra (Fase 3) o el
// valor de mercado actual (Fase 3.5).
export type ValuationBasis = 'cost' | 'market';

export interface DiversificationDto {
  currency: string;
  basis: ValuationBasis;
  totalInvested: string;
  byPosition: AllocationSliceDto[];
  byMarket: AllocationSliceDto[];
  // Reparto por sector amplio del emisor (Fase 3.6). Vacío si no hay proveedor
  // configurado o si todavía no se pudo obtener ningún perfil.
  bySector: AllocationSliceDto[];
  // Reparto por país del emisor, que NO es el mercado donde cotiza: hay
  // empresas peruanas listadas en NYSE, y esa exposición no se ve en `market`.
  byCountry: AllocationSliceDto[];
  // Peso agregado de los emisores fuera de Estados Unidos, en porcentaje.
  // null cuando no hay datos de país para ninguna posición.
  nonUsWeight: number | null;
  concentration: {
    positionsCount: number;
    topWeight: number; // % de la posición más grande
    top3Weight: number; // % de las 3 más grandes
    hhi: number; // índice Herfindahl-Hirschman (0..1); mayor = más concentrado
    effectivePositions: number; // 1/hhi: nº de posiciones "equivalentes" equiponderadas
  };
  // Posiciones excluidas por no tener cotización (solo aplica a basis='market').
  excludedForMissingQuote: number;
}

// Vela diaria OHLC, tal como la entrega el proveedor de cotizaciones.
export interface CandleDto {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentDetailDto {
  position: PositionDto;
  isOpen: boolean;
  candles: CandleDto[];
  // Precios y velas vienen de proveedores distintos, así que se informan por
  // separado: se puede tener valor de mercado sin gráfico, y viceversa.
  quotesConfigured: boolean;
  candlesConfigured: boolean;
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
  instrumentId: string;
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  externalTicker: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly profiles: ProfilesService,
  ) {}

  /** Posiciones abiertas del portafolio (cantidad neta > 0). */
  private openPositions(
    accumulators: Map<string, InstrumentAccumulator>,
  ): InstrumentAccumulator[] {
    return [...accumulators.values()].filter((acc) =>
      acc.quantity.greaterThan(EPSILON),
    );
  }

  private toPositionDto(
    acc: InstrumentAccumulator,
    quote: QuoteDto | undefined,
    profile?: ProfileDto,
  ): PositionDto {
    const costBasis = acc.quantity.times(acc.averageCost);

    let marketPrice: DecimalValue | null = null;
    let marketValue: DecimalValue | null = null;
    let unrealizedPnL: DecimalValue | null = null;
    let returnPct: number | null = null;

    if (quote) {
      marketPrice = new D(quote.price);
      marketValue = acc.quantity.times(marketPrice);
      unrealizedPnL = marketValue.minus(costBasis);

      // Un costo base despreciable hace explotar el porcentaje. El caso real es
      // FDXF.US, un spinoff que entró a $0,00279: su rendimiento da +1.390.100%,
      // que es correcto pero no informa nada, y en un gráfico comparativo
      // aplasta al resto de las barras hasta volverlas invisibles.
      //
      // El umbral es relativo al propio valor de mercado de la posición —"no
      // pagaste prácticamente nada por esto"— en vez de un absoluto arbitrario.
      // Separa con holgura: FDXF queda en 0,007% y la siguiente posición más
      // barata en ~80%.
      //
      // Solo se anula el porcentaje. El P&L en dinero se sigue reportando,
      // porque esos $38 sí son reales y sí se pueden comparar.
      const negligibleCost =
        costBasis.abs().lessThanOrEqualTo(EPSILON) ||
        costBasis.abs().lessThan(marketValue.abs().times(NEGLIGIBLE_COST_RATIO));

      returnPct = negligibleCost
        ? null
        : Number(unrealizedPnL.dividedBy(costBasis).times(100));
    }

    return {
      symbol: acc.symbol,
      name: profile?.name ?? acc.name,
      logoUrl: profile?.logoUrl ?? null,
      market: acc.market,
      currency: acc.currency,
      quantity: acc.quantity.toString(),
      averageCost: acc.averageCost.toString(),
      costBasis: costBasis.toString(),
      realizedPnL: acc.realizedPnL.toString(),
      dividendsCollected: acc.dividendsCollected.toString(),
      marketPrice: marketPrice?.toString() ?? null,
      marketValue: marketValue?.toString() ?? null,
      unrealizedPnL: unrealizedPnL?.toString() ?? null,
      returnPct,
      quoteAsOf: quote?.asOf ?? null,
      quoteStale: quote?.stale ?? false,
    };
  }

  // `refresh` fuerza consulta al proveedor ignorando el cache — lo dispara el
  // botón "Actualizar precios", no la navegación normal.
  async getPositions(refresh = false): Promise<PositionDto[]> {
    const { accumulators } = await this.compute();
    const open = this.openPositions(accumulators);
    // Cotizaciones y perfiles son independientes y cada uno tiene su cache; el
    // de perfiles tiene TTL de 30 días, así que después de la primera carga
    // esto no cuesta ninguna llamada al proveedor.
    const [quotes, profiles] = await Promise.all([
      this.quotes.getQuotes(open, refresh),
      this.profiles.getProfiles(open),
    ]);

    return open
      .map((acc) =>
        this.toPositionDto(
          acc,
          quotes.get(acc.instrumentId),
          profiles.get(acc.instrumentId),
        ),
      )
      .sort((a, b) => Number(b.costBasis) - Number(a.costBasis));
  }

  async getSummary(refresh = false): Promise<PortfolioSummaryDto> {
    const { accumulators } = await this.compute();
    const open = this.openPositions(accumulators);
    const quotes = await this.quotes.getQuotes(open, refresh);

    let totalInvested = new D(0);
    let realizedPnL = new D(0);
    let dividendsCollected = new D(0);
    let currency = 'USD';

    for (const acc of accumulators.values()) {
      currency = acc.currency;
      realizedPnL = realizedPnL.plus(acc.realizedPnL);
      dividendsCollected = dividendsCollected.plus(acc.dividendsCollected);
    }

    // La valuación a mercado solo suma las posiciones con cotización; se
    // acumula su costo por separado para que el rendimiento % compare
    // exactamente el mismo subconjunto (si no, mezclaría peras con manzanas).
    let marketValue = new D(0);
    let costOfQuoted = new D(0);
    let positionsWithQuote = 0;

    for (const acc of open) {
      const costBasis = acc.quantity.times(acc.averageCost);
      totalInvested = totalInvested.plus(costBasis);

      const quote = quotes.get(acc.instrumentId);
      if (quote) {
        marketValue = marketValue.plus(acc.quantity.times(new D(quote.price)));
        costOfQuoted = costOfQuoted.plus(costBasis);
        positionsWithQuote++;
      }
    }

    const hasQuotes = positionsWithQuote > 0;
    const unrealizedPnL = hasQuotes ? marketValue.minus(costOfQuoted) : null;

    return {
      currency,
      totalInvested: totalInvested.toString(),
      realizedPnL: realizedPnL.toString(),
      dividendsCollected: dividendsCollected.toString(),
      openPositionsCount: open.length,
      instrumentsCount: accumulators.size,
      marketValue: hasQuotes ? marketValue.toString() : null,
      unrealizedPnL: unrealizedPnL?.toString() ?? null,
      totalPnL: unrealizedPnL
        ? unrealizedPnL.plus(realizedPnL).plus(dividendsCollected).toString()
        : null,
      returnPct:
        unrealizedPnL && costOfQuoted.abs().greaterThan(EPSILON)
          ? Number(unrealizedPnL.dividedBy(costOfQuoted).times(100))
          : null,
      positionsWithQuote,
      positionsWithoutQuote: open.length - positionsWithQuote,
      quotesConfigured: this.quotes.isConfigured(),
    };
  }

  /**
   * Detalle de un instrumento para su vista propia: la posición (si sigue
   * abierta) más sus velas históricas.
   */
  async getInstrumentDetail(
    symbol: string,
    days: number,
  ): Promise<InstrumentDetailDto> {
    const { accumulators } = await this.compute();
    const acc = [...accumulators.values()].find(
      (a) => a.symbol.toUpperCase() === symbol.toUpperCase(),
    );
    if (!acc) {
      throw new NotFoundException(`No hay operaciones para ${symbol}.`);
    }

    const isOpen = acc.quantity.greaterThan(EPSILON);
    const quotes = isOpen ? await this.quotes.getQuotes([acc]) : new Map();
    const candles = await this.quotes.getCandles(acc, days);
    // También para posiciones cerradas: el nombre y el logo siguen siendo
    // válidos aunque ya no tengas la acción.
    const profiles = await this.profiles.getProfiles([acc]);

    return {
      position: this.toPositionDto(
        acc,
        quotes.get(acc.instrumentId),
        profiles.get(acc.instrumentId),
      ),
      isOpen,
      candles,
      quotesConfigured: this.quotes.isConfigured(),
      candlesConfigured: this.quotes.isCandlesConfigured(),
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
   * "Empresas que poseías": posiciones que se compraron y vendieron por
   * completo, una fila por ciclo (ver `closed-positions.ts`). El modelo de
   * datos no distingue ciclos explícitamente — se derivan recorriendo las
   * operaciones de cada instrumento en orden cronológico y cortando cada vez
   * que la cantidad neta vuelve a cero. Más reciente primero por fecha de
   * cierre.
   */
  async getClosedPositions(): Promise<ClosedPositionDto[]> {
    const operations = await this.prisma.operation.findMany({
      include: { instrument: true },
      where: { type: { in: ['BUY', 'SELL'] } },
    });

    const grouped = new Map<string, typeof operations>();
    for (const op of operations) {
      const list = grouped.get(op.instrumentId) ?? [];
      list.push(op);
      grouped.set(op.instrumentId, list);
    }

    const instrumentRefs = [...grouped.values()].map((ops) => ({
      instrumentId: ops[0].instrumentId,
      symbol: ops[0].instrument.symbol,
      externalTicker: ops[0].instrument.externalTicker,
    }));
    const profiles = await this.profiles.getProfiles(instrumentRefs);

    const closedPositions: ClosedPositionDto[] = [];

    for (const [instrumentId, ops] of grouped) {
      ops.sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
      });

      const instrument = ops[0].instrument;
      const cycles = computeClosedCycles(
        ops.map((op) => ({
          type: op.type as 'BUY' | 'SELL',
          date: op.date,
          quantity: new D(op.quantity),
          price: new D(op.price),
          commission: new D(op.commission),
        })),
      );

      const profile = profiles.get(instrumentId);

      for (const cycle of cycles) {
        const negligibleCost =
          cycle.totalBuyCost.abs().lessThanOrEqualTo(EPSILON);

        closedPositions.push({
          symbol: instrument.symbol,
          name: profile?.name ?? instrument.name,
          logoUrl: profile?.logoUrl ?? null,
          market: instrument.market,
          currency: instrument.currency,
          openDate: cycle.openDate.toISOString(),
          closeDate: cycle.closeDate.toISOString(),
          quantity: cycle.quantity.toString(),
          averageBuyPrice: cycle.averageBuyPrice.toString(),
          averageSellPrice: cycle.averageSellPrice.toString(),
          realizedPnL: cycle.realizedPnL.toString(),
          returnPct: negligibleCost
            ? null
            : Number(cycle.realizedPnL.dividedBy(cycle.totalBuyCost).times(100)),
        });
      }
    }

    return closedPositions.sort((a, b) => b.closeDate.localeCompare(a.closeDate));
  }

  /**
   * Diversificación y concentración del portafolio, sobre el costo base de las
   * posiciones abiertas (no requiere precios de mercado). Devuelve el peso de
   * cada posición y de cada mercado, más indicadores de concentración.
   */
  async getDiversification(
    basis: ValuationBasis = 'cost',
  ): Promise<DiversificationDto> {
    const { accumulators } = await this.compute();
    const openAccs = this.openPositions(accumulators);

    // A valor de mercado solo entran las posiciones con cotización: incluir
    // las demás a costo mezclaría dos unidades distintas en el mismo total.
    const quotes =
      basis === 'market'
        ? await this.quotes.getQuotes(openAccs)
        : new Map<string, QuoteDto>();

    // Los perfiles (sector/país) van en paralelo a las cotizaciones: no
    // dependen entre sí y ambos tienen su propio cache.
    const profiles = await this.profiles.getProfiles(openAccs);

    const open = openAccs
      .map((acc) => {
        const quote = quotes.get(acc.instrumentId);
        if (basis === 'market' && !quote) return null;
        const value =
          basis === 'market' && quote
            ? acc.quantity.times(new D(quote.price))
            : acc.quantity.times(acc.averageCost);
        const profile = profiles.get(acc.instrumentId);
        return {
          symbol: acc.symbol,
          market: acc.market,
          costBasis: value,
          sector: profile?.sector ?? null,
          country: profile?.country ?? null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const excludedForMissingQuote = openAccs.length - open.length;
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

    // Reparto por sector y por país del emisor. Las posiciones sin perfil no
    // se fuerzan a una categoría inventada: quedan fuera, y el peso que falta
    // para llegar a 100% es lo que la UI reporta como "sin clasificar".
    const groupBy = (
      key: (p: (typeof open)[number]) => string | null,
    ): AllocationSliceDto[] => {
      const totals = new Map<string, DecimalValue>();
      for (const p of open) {
        const k = key(p);
        if (!k) continue;
        totals.set(k, (totals.get(k) ?? new D(0)).plus(p.costBasis));
      }
      return [...totals.entries()]
        .map(([label, cb]) => ({
          label,
          market: null,
          costBasis: cb.toString(),
          weight: weightPct(cb),
        }))
        .sort((a, b) => Number(b.costBasis) - Number(a.costBasis));
    };

    const bySector = groupBy((p) => p.sector);
    const byCountry = groupBy((p) => p.country);
    const nonUsWeight =
      byCountry.length === 0
        ? null
        : byCountry
            .filter((c) => c.label !== 'US')
            .reduce((sum, c) => sum + c.weight, 0);

    // Fracciones (0..1) para los indicadores de concentración.
    const fractions = open
      .map((p) => (total.isZero() ? 0 : Number(p.costBasis.dividedBy(total))))
      .sort((a, b) => b - a);
    const hhi = fractions.reduce((s, f) => s + f * f, 0);
    const topWeight = (fractions[0] ?? 0) * 100;
    const top3Weight = fractions.slice(0, 3).reduce((s, f) => s + f, 0) * 100;

    return {
      currency,
      basis,
      totalInvested: total.toString(),
      byPosition,
      byMarket,
      bySector,
      byCountry,
      nonUsWeight,
      concentration: {
        positionsCount: open.length,
        topWeight,
        top3Weight,
        hhi,
        effectivePositions: hhi > 0 ? 1 / hhi : 0,
      },
      excludedForMissingQuote,
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
        instrumentId,
        symbol: instrument.symbol,
        name: instrument.name,
        market: instrument.market,
        currency: instrument.currency,
        externalTicker: instrument.externalTicker,
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
