/**
 * Contrato común de los proveedores de datos de mercado (Fase 3.5).
 *
 * El sistema usa dos proveedores distintos porque ninguno cubre bien las dos
 * necesidades en su plan gratuito:
 * - **Precios** (Finnhub): 60 llamadas/min, alcanza para todas las posiciones.
 * - **Velas históricas** (Twelve Data): el free tier de Finnhub ya no las
 *   incluye (`/stock/candle` responde 403).
 */

export interface ProviderQuote {
  ticker: string;
  price: number;
  currency: string;
  asOf: Date;
}

export interface ProviderCandle {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Perfil de la empresa detrás de un ticker (Fase 3.6). Los dos campos son
 * opcionales porque el proveedor puede reconocer el símbolo pero no tener
 * clasificación para él.
 */
export interface ProviderProfile {
  ticker: string;
  industry: string | null;
  /** País del emisor en ISO-2 (`US`, `PE`, ...). */
  country: string | null;
}

/** El proveedor rechazó por exceso de uso; hay que dejar de pedirle un rato. */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
