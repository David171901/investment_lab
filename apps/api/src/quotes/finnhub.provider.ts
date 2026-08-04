import { Injectable, Logger } from '@nestjs/common';
import {
  RateLimitError,
  type ProviderQuote,
  type ProviderProfile,
} from './provider-types';

const BASE_URL = process.env.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1';

// Finnhub no tiene endpoint batch: es una llamada por símbolo. Su límite es de
// 60 llamadas/min, así que un portafolio de decenas de posiciones entra sin
// problema, pero mandamos de a tandas para no disparar una ráfaga.
const CONCURRENCY = 5;

/**
 * Proveedor de **precios** (Fase 3.5). Se eligió sobre Twelve Data porque su
 * límite es por llamada y no por símbolo: cotizar 13 posiciones son 13 de las
 * 60 llamadas/min permitidas, mientras que en Twelve Data eran 13 créditos
 * contra un techo de 8/min — imposible de satisfacer.
 */
@Injectable()
export class FinnhubProvider {
  private readonly logger = new Logger(FinnhubProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.FINNHUB_API_KEY);
  }

  private apiKey(): string {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new Error('FINNHUB_API_KEY no está configurada.');
    return key;
  }

  async fetchQuotes(tickers: string[]): Promise<ProviderQuote[]> {
    if (tickers.length === 0) return [];

    const results: ProviderQuote[] = [];
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      const batch = tickers.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        batch.map((ticker) => this.fetchOne(ticker)),
      );
      for (const quote of settled) {
        if (quote) results.push(quote);
      }
    }
    return results;
  }

  /**
   * Un símbolo sin datos no es un error: hay tickers de XTB sin equivalente en
   * el proveedor. Solo el rate limit se propaga, porque debe activar el
   * backoff global en vez de seguir intentando con el resto.
   */
  private async fetchOne(ticker: string): Promise<ProviderQuote | null> {
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(ticker)}&token=${this.apiKey()}`;

    const res = await fetch(url);
    if (res.status === 429) {
      throw new RateLimitError('Finnhub: límite de uso alcanzado (429).');
    }
    if (!res.ok) {
      this.logger.warn(`Sin cotización para ${ticker}: HTTP ${res.status}.`);
      return null;
    }

    const body = (await res.json()) as Record<string, unknown>;
    // `c` = current price. Finnhub devuelve 0 cuando no conoce el símbolo.
    const price = Number(body.c);
    if (!Number.isFinite(price) || price === 0) {
      this.logger.warn(`Sin cotización para ${ticker}: el proveedor no lo reconoce.`);
      return null;
    }

    const timestamp = Number(body.t);
    const asOf =
      Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp * 1000)
        : new Date();

    return {
      ticker,
      price,
      // Finnhub no informa la moneda en /quote; sus acciones US cotizan en USD,
      // y la UI formatea con la moneda del instrumento de todos modos.
      currency: 'USD',
      asOf,
    };
  }

  /**
   * Perfil (industria y país del emisor) de varios tickers (Fase 3.6).
   *
   * Igual que `/quote`, es una llamada por símbolo. A diferencia de los
   * precios, esto se pide una sola vez por instrumento: el sector de una
   * empresa no cambia, así que el consumo de cuota es despreciable.
   */
  async fetchProfiles(tickers: string[]): Promise<ProviderProfile[]> {
    if (tickers.length === 0) return [];

    const results: ProviderProfile[] = [];
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      const batch = tickers.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        batch.map((ticker) => this.fetchProfile(ticker)),
      );
      for (const profile of settled) {
        if (profile) results.push(profile);
      }
    }
    return results;
  }

  private async fetchProfile(ticker: string): Promise<ProviderProfile | null> {
    const url = `${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${this.apiKey()}`;

    const res = await fetch(url);
    if (res.status === 429) {
      throw new RateLimitError('Finnhub: límite de uso alcanzado (429).');
    }
    if (!res.ok) {
      this.logger.warn(`Sin perfil para ${ticker}: HTTP ${res.status}.`);
      return null;
    }

    // Un símbolo desconocido devuelve `{}` con HTTP 200, no un error.
    const body = (await res.json()) as Record<string, unknown>;
    const industry = body.finnhubIndustry;
    const country = body.country;
    if (!industry && !country) {
      this.logger.warn(`Sin perfil para ${ticker}: el proveedor no lo reconoce.`);
      return null;
    }

    return {
      ticker,
      industry: typeof industry === 'string' && industry ? industry : null,
      country: typeof country === 'string' && country ? country : null,
    };
  }
}
