import { Injectable, Logger } from '@nestjs/common';
import {
  RateLimitError,
  type ProviderQuote,
  type ProviderCandle,
} from './provider-types';

// Sobrescribible por entorno para poder apuntar a un mock local en pruebas sin
// gastar cuota real del proveedor.
const BASE_URL = process.env.TWELVEDATA_BASE_URL ?? 'https://api.twelvedata.com';
// Twelve Data cobra **un crédito por símbolo**, no por request: pedir 13
// símbolos en una sola llamada gasta 13 créditos igual. Por eso los precios los
// pide Finnhub (límite por llamada, no por símbolo) y acá quedan solo las velas,
// que son 1 símbolo por vez y sí entran en el techo de 8 créditos/min.
const MAX_BATCH_SIZE = 120;

/**
 * Cliente de Twelve Data. Hoy se usa **solo para velas históricas**, porque el
 * free tier de Finnhub no las incluye. `fetchQuotes` se mantiene por si hiciera
 * falta volver a usarlo como proveedor de precios, pero `QuotesService` no lo
 * llama.
 */
@Injectable()
export class TwelveDataProvider {
  private readonly logger = new Logger(TwelveDataProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.TWELVEDATA_API_KEY);
  }

  private apiKey(): string {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) throw new Error('TWELVEDATA_API_KEY no está configurada.');
    return key;
  }

  private errorFor(status: number): Error {
    return status === 429
      ? new RateLimitError('Twelve Data: límite de uso alcanzado (429).')
      : new Error(`Twelve Data respondió ${status}.`);
  }

  /**
   * Twelve Data devuelve el rate limit tanto como HTTP 429 como con HTTP 200 y
   * `{code: 429}` en el cuerpo; si solo miráramos el status, el segundo caso
   * pasaría por "respuesta válida sin datos" y no activaría el backoff.
   */
  private throwIfRateLimited(body: unknown): void {
    if (!body || typeof body !== 'object') return;
    const b = body as Record<string, unknown>;
    if (Number(b.code) === 429) {
      throw new RateLimitError(
        String(b.message ?? 'Twelve Data: límite de uso alcanzado.'),
      );
    }
  }

  /**
   * Precio actual de varios tickers en una sola llamada. Los tickers que el
   * proveedor no reconoce simplemente no aparecen en el resultado (no es un
   * error: hay símbolos de XTB sin equivalente, ej. clases de acción propias).
   */
  async fetchQuotes(tickers: string[]): Promise<ProviderQuote[]> {
    if (tickers.length === 0) return [];

    const results: ProviderQuote[] = [];
    for (let i = 0; i < tickers.length; i += MAX_BATCH_SIZE) {
      const batch = tickers.slice(i, i + MAX_BATCH_SIZE);
      const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(batch.join(','))}&apikey=${this.apiKey()}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw this.errorFor(res.status);
      }
      const body: unknown = await res.json();
      // El rate limit también puede llegar con HTTP 200 y el código en el body.
      this.throwIfRateLimited(body);

      // Con un solo símbolo devuelve el objeto directo; con varios, un mapa
      // { TICKER: {...} }. Normalizamos ambos casos a una lista.
      const entries: [string, unknown][] =
        batch.length === 1
          ? [[batch[0], body]]
          : Object.entries(body as Record<string, unknown>);

      for (const [ticker, raw] of entries) {
        const quote = this.parseQuote(ticker, raw);
        if (quote) results.push(quote);
      }
    }
    return results;
  }

  private parseQuote(ticker: string, raw: unknown): ProviderQuote | null {
    if (!raw || typeof raw !== 'object') return null;
    const q = raw as Record<string, unknown>;

    // Error por símbolo (ej. no encontrado) o error global de la API.
    if (q.status === 'error' || q.code) {
      this.logger.warn(
        `Sin cotización para ${ticker}: ${String(q.message ?? q.code)}`,
      );
      return null;
    }

    const price = Number(q.close);
    if (!Number.isFinite(price)) return null;

    // `timestamp` viene en segundos epoch; `datetime` es el fallback textual.
    const asOf =
      typeof q.timestamp === 'number'
        ? new Date(q.timestamp * 1000)
        : new Date(String(q.datetime ?? Date.now()));

    return {
      ticker,
      price,
      currency: String(q.currency ?? 'USD'),
      asOf: Number.isNaN(asOf.getTime()) ? new Date() : asOf,
    };
  }

  /** Velas diarias (OHLC) de un ticker. No se persisten: se piden bajo demanda. */
  async fetchCandles(ticker: string, days: number): Promise<ProviderCandle[]> {
    const url =
      `${BASE_URL}/time_series?symbol=${encodeURIComponent(ticker)}` +
      `&interval=1day&outputsize=${days}&order=ASC&apikey=${this.apiKey()}`;

    const res = await fetch(url);
    if (!res.ok) throw this.errorFor(res.status);

    const body = (await res.json()) as Record<string, unknown>;
    this.throwIfRateLimited(body);
    if (body.status === 'error') {
      throw new Error(String(body.message ?? 'Error del proveedor.'));
    }

    const values = Array.isArray(body.values) ? body.values : [];
    return values
      .map((v) => {
        const row = v as Record<string, unknown>;
        return {
          date: String(row.datetime ?? ''),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume ?? 0),
        };
      })
      .filter((c) => c.date && Number.isFinite(c.close));
  }
}
