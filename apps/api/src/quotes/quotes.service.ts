import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { TwelveDataProvider } from './twelve-data.provider';
import { FinnhubProvider } from './finnhub.provider';
import { RateLimitError, type ProviderCandle } from './provider-types';

// Ventana durante la cual una cotización cacheada se considera vigente. Sin
// esto, cada recarga del dashboard dispararía una llamada por instrumento y
// agotaría el free tier del proveedor.
//
// El límite que manda es el diario de Finnhub (~300 llamadas), no el de 60/min:
// un refresco completo son 13 llamadas (una por posición), así que da para ~23
// refrescos por día. Con 5 minutos el uso normal queda muy por debajo, y para
// el precio del momento está el refresco forzado (`getQuotes(..., true)`).
const CACHE_TTL_MS = 5 * 60 * 1000;

// Las velas diarias cambian una vez por día: no hace falta re-pedirlas cada vez
// que se abre la vista de detalle de un instrumento.
const CANDLE_TTL_MS = 12 * 60 * 60 * 1000;

// Tras un rechazo por exceso de uso, dejamos de pedirle al proveedor durante
// este tiempo. Sin esto se forma un bucle: al no poder cachear nada, cada
// request siguiente vuelve a intentar y multiplica el exceso.
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

// Un símbolo que el proveedor no reconoce (ej. `GOOGC`, que es una clase de
// acción propia de XTB) no deja cache, así que sin esto se volvería a pedir en
// cada request, para siempre. No es un fallo transitorio sino un problema de
// mapeo, que se corrige cargando `Instrument.externalTicker` — hasta entonces,
// no tiene sentido reintentar seguido.
const UNRESOLVED_RETRY_MS = 6 * 60 * 60 * 1000;

export interface QuoteDto {
  price: string;
  currency: string;
  asOf: string;
  // true = el proveedor no respondió y estamos devolviendo el último precio
  // conocido; la UI lo marca para no dar por actual un dato viejo.
  stale: boolean;
}

interface InstrumentRef {
  instrumentId: string;
  symbol: string;
  externalTicker: string | null;
}

/**
 * Cotizaciones de mercado con cache en Postgres (Fase 3.5).
 *
 * Reglas de resiliencia: una falla del proveedor nunca se propaga como error.
 * Si no hay clave configurada, o la API falla, o el símbolo no existe allá,
 * el instrumento simplemente queda sin precio de mercado y el resto del
 * sistema lo muestra "a costo", como antes de esta fase.
 */
@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  // Momento hasta el cual no se le pide nada al proveedor (backoff por exceso).
  private rateLimitedUntil = 0;

  // Consultas en curso, indexadas por el conjunto de tickers pedido. El
  // dashboard llama a getSummary() y getPositions() en paralelo y ambos piden
  // las mismas cotizaciones: sin esto se dispararían dos llamadas idénticas.
  private readonly inFlight = new Map<
    string,
    Promise<Map<string, QuoteDto>>
  >();

  // Tickers que el proveedor no supo resolver, con el momento en que conviene
  // reintentarlos. Ver `UNRESOLVED_RETRY_MS`.
  private readonly unresolved = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    // Precios: límite por llamada (60/min), alcanza para todo el portafolio.
    private readonly quotesProvider: FinnhubProvider,
    // Velas: el free tier de Finnhub no las incluye.
    private readonly candlesProvider: TwelveDataProvider,
  ) {}

  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  private startCooldown(message: string): void {
    this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    this.logger.warn(
      `${message} — no se consultará al proveedor por ${RATE_LIMIT_COOLDOWN_MS / 1000}s.`,
    );
  }

  /** ¿Hay proveedor de precios configurado? (valor de mercado, P&L no realizado) */
  isConfigured(): boolean {
    return this.quotesProvider.isConfigured();
  }

  /** ¿Hay proveedor de velas configurado? (gráfico histórico por instrumento) */
  isCandlesConfigured(): boolean {
    return this.candlesProvider.isConfigured();
  }

  /**
   * El ticker con el que se consulta al proveedor. XTB exporta `META.US`,
   * pero el proveedor espera `META`; el sufijo de mercado se quita salvo que
   * haya un `externalTicker` cargado a mano para ese instrumento.
   */
  static tickerFor(instrument: InstrumentRef): string {
    return instrument.externalTicker ?? instrument.symbol.split('.')[0];
  }

  /**
   * Cotizaciones por instrumentId. Los instrumentos sin precio no aparecen.
   *
   * Las llamadas concurrentes con el mismo conjunto de instrumentos comparten
   * una única consulta al proveedor (ver `inFlight`).
   */
  async getQuotes(
    instruments: InstrumentRef[],
    force = false,
  ): Promise<Map<string, QuoteDto>> {
    if (instruments.length === 0 || !this.quotesProvider.isConfigured()) {
      return new Map();
    }

    // `force` entra en la clave: un refresco manual no debe engancharse a una
    // consulta normal en curso, que podría estar por devolver datos del cache.
    const key = `${force ? 'force:' : ''}${instruments
      .map((i) => i.instrumentId)
      .sort()
      .join(',')}`;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.loadQuotes(instruments, force).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async loadQuotes(
    instruments: InstrumentRef[],
    force: boolean,
  ): Promise<Map<string, QuoteDto>> {
    const result = new Map<string, QuoteDto>();

    const cached = await this.prisma.quote.findMany({
      where: { instrumentId: { in: instruments.map((i) => i.instrumentId) } },
    });
    const cacheById = new Map(cached.map((q) => [q.instrumentId, q]));

    const cutoff = Date.now() - CACHE_TTL_MS;
    const stale: InstrumentRef[] = [];

    for (const instrument of instruments) {
      const hit = cacheById.get(instrument.instrumentId);
      // Con `force` nada del cache cuenta como vigente: se vuelve a consultar.
      if (!force && hit && hit.fetchedAt.getTime() > cutoff) {
        result.set(instrument.instrumentId, {
          price: hit.price.toString(),
          currency: hit.currency,
          asOf: hit.asOf.toISOString(),
          stale: false,
        });
      } else {
        stale.push(instrument);
      }
    }

    // Durante el backoff ni siquiera se intenta: todo lo vencido cae al último
    // valor cacheado (marcado como desactualizado) más abajo.
    if (stale.length === 0 || this.isRateLimited()) {
      return this.fillWithStale(result, stale, cacheById);
    }

    // Un instrumento puede compartir ticker con otro (no debería, pero el
    // mapeo es derivado): indexamos por ticker para repartir la respuesta.
    // Se saltean los que el proveedor ya rechazó hace poco.
    const now = Date.now();
    const byTicker = new Map<string, InstrumentRef[]>();
    for (const instrument of stale) {
      const ticker = QuotesService.tickerFor(instrument);
      // Un refresco manual también reintenta los irresolubles: puede que se
      // acabe de corregir su `externalTicker`.
      if (!force) {
        const retryAt = this.unresolved.get(ticker);
        if (retryAt !== undefined && now < retryAt) continue;
      }
      byTicker.set(ticker, [...(byTicker.get(ticker) ?? []), instrument]);
    }

    if (byTicker.size === 0) {
      return this.fillWithStale(result, stale, cacheById);
    }

    try {
      const requested = [...byTicker.keys()];
      const fetched = await this.quotesProvider.fetchQuotes(requested);

      // Lo que se pidió y no volvió, el proveedor no lo reconoce.
      const resolved = new Set(fetched.map((q) => q.ticker));
      for (const ticker of requested) {
        if (resolved.has(ticker)) {
          this.unresolved.delete(ticker);
        } else {
          this.unresolved.set(ticker, Date.now() + UNRESOLVED_RETRY_MS);
        }
      }

      for (const quote of fetched) {
        for (const instrument of byTicker.get(quote.ticker) ?? []) {
          await this.prisma.quote.upsert({
            where: { instrumentId: instrument.instrumentId },
            create: {
              instrumentId: instrument.instrumentId,
              price: quote.price,
              currency: quote.currency,
              asOf: quote.asOf,
            },
            update: {
              price: quote.price,
              currency: quote.currency,
              asOf: quote.asOf,
              fetchedAt: new Date(),
            },
          });
          result.set(instrument.instrumentId, {
            price: String(quote.price),
            currency: quote.currency,
            asOf: quote.asOf.toISOString(),
            stale: false,
          });
        }
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        this.startCooldown(err.message);
      } else {
        this.logger.warn(
          `Falló la consulta de cotizaciones: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.fillWithStale(result, stale, cacheById);
  }

  /**
   * Lo que quedó sin precio fresco cae al último valor cacheado, marcado como
   * desactualizado. Si nunca hubo cache, el instrumento queda sin precio.
   */
  private fillWithStale(
    result: Map<string, QuoteDto>,
    pending: InstrumentRef[],
    cacheById: Map<
      string,
      { price: unknown; currency: string; asOf: Date }
    >,
  ): Map<string, QuoteDto> {
    for (const instrument of pending) {
      if (result.has(instrument.instrumentId)) continue;
      const hit = cacheById.get(instrument.instrumentId);
      if (hit) {
        result.set(instrument.instrumentId, {
          price: String(hit.price),
          currency: hit.currency,
          asOf: hit.asOf.toISOString(),
          stale: true,
        });
      }
    }
    return result;
  }

  /**
   * Velas diarias de un instrumento. Se cachean en base (`CandleCache`) porque
   * cambian una vez por día: sin eso, cada visita a la vista de detalle
   * gastaría cuota del proveedor.
   */
  async getCandles(
    instrument: InstrumentRef,
    days: number,
  ): Promise<ProviderCandle[]> {
    if (!this.candlesProvider.isConfigured()) return [];

    const cached = await this.prisma.candleCache.findUnique({
      where: { instrumentId: instrument.instrumentId },
    });
    const isFresh =
      cached && Date.now() - cached.fetchedAt.getTime() < CANDLE_TTL_MS;
    if (isFresh) return cached.payload as unknown as ProviderCandle[];

    // Sin datos frescos y en backoff: mejor devolver las velas viejas (si las
    // hay) que insistirle al proveedor que ya nos rechazó.
    if (this.isRateLimited()) {
      return cached ? (cached.payload as unknown as ProviderCandle[]) : [];
    }

    try {
      const candles = await this.candlesProvider.fetchCandles(
        QuotesService.tickerFor(instrument),
        days,
      );
      if (candles.length > 0) {
        // Prisma tipa las columnas Json de forma estricta; el array de velas es
        // JSON válido pero no encaja en `InputJsonObject` sin este cast.
        const payload = candles as unknown as Prisma.InputJsonValue;
        await this.prisma.candleCache.upsert({
          where: { instrumentId: instrument.instrumentId },
          create: { instrumentId: instrument.instrumentId, payload },
          update: { payload, fetchedAt: new Date() },
        });
      }
      return candles;
    } catch (err) {
      if (err instanceof RateLimitError) {
        this.startCooldown(err.message);
      } else {
        this.logger.warn(
          `Falló la consulta de velas para ${instrument.symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return cached ? (cached.payload as unknown as ProviderCandle[]) : [];
    }
  }
}
