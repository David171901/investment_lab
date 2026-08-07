const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface Operation {
  id: string;
  externalId: string;
  type: "BUY" | "SELL" | "DIVIDEND";
  date: string;
  quantity: string;
  price: string;
  commission: string;
  currency: string;
  instrument: {
    symbol: string;
    name: string;
    market: string | null;
  };
}

export interface ParseError {
  sheet: string;
  row: number;
  message: string;
}

// Resultado de una importación ya aplicada (Fase 4.5: reemplazo total).
export interface ImportSummary {
  operationsBefore: number;
  operationsAfter: number;
  added: number;
  removed: number;
  kept: number;
  duplicatesInFile: number;
  errors: ParseError[];
}

// Qué pasaría al importar, sin escribir nada.
export interface ImportPreview {
  operationsInFile: number;
  operationsInDb: number;
  added: number;
  removed: number;
  kept: number;
  duplicatesInFile: number;
  errors: ParseError[];
  warnsLargeDeletion: boolean;
}

export interface LastImportRun {
  fileName: string;
  importedAt: string;
  operationsBefore: number;
  operationsAfter: number;
  status: "OK" | "FAILED";
  errorCount: number;
}

export async function fetchOperations(): Promise<Operation[]> {
  const res = await fetch(`${API_URL}/operations`);
  if (!res.ok) throw new Error("No se pudieron cargar las operaciones.");
  return res.json();
}

async function postXtbFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "Error al procesar el archivo.");
  }

  return res.json();
}

// Consulta qué cambiaría, sin escribir. El archivo se sube dos veces (una por
// paso del flujo) a propósito: evita guardar archivos temporales en el servidor.
export async function previewXtbImport(file: File): Promise<ImportPreview> {
  return postXtbFile<ImportPreview>("/import/xtb/preview", file);
}

// OJO: reemplaza TODAS las operaciones por las del archivo.
export async function importXtbFile(file: File): Promise<ImportSummary> {
  return postXtbFile<ImportSummary>("/import/xtb", file);
}

export async function fetchLastImportRun(): Promise<LastImportRun | null> {
  const res = await fetch(`${API_URL}/import/last-run`);
  if (!res.ok) throw new Error("No se pudo cargar la última importación.");
  return res.json();
}

export interface Position {
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  quantity: string;
  averageCost: string;
  costBasis: string;
  realizedPnL: string;
  dividendsCollected: string;
  // null cuando no hay cotización para el instrumento.
  marketPrice: string | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
  returnPct: number | null;
  quoteAsOf: string | null;
  quoteStale: boolean;
}

export interface PortfolioSummary {
  currency: string;
  totalInvested: string;
  realizedPnL: string;
  dividendsCollected: string;
  openPositionsCount: number;
  instrumentsCount: number;
  marketValue: string | null;
  unrealizedPnL: string | null;
  totalPnL: string | null;
  returnPct: number | null;
  positionsWithQuote: number;
  positionsWithoutQuote: number;
  quotesConfigured: boolean;
}

// `refresh` ignora el cache de cotizaciones del backend y consulta al proveedor.
// Solo debería usarlo una acción explícita del usuario: consume cuota real.
export async function fetchPositions(refresh = false): Promise<Position[]> {
  const res = await fetch(
    `${API_URL}/portfolio/positions${refresh ? "?refresh=true" : ""}`,
  );
  if (!res.ok) throw new Error("No se pudieron cargar las posiciones.");
  return res.json();
}

export async function fetchPortfolioSummary(
  refresh = false,
): Promise<PortfolioSummary> {
  const res = await fetch(
    `${API_URL}/portfolio/summary${refresh ? "?refresh=true" : ""}`,
  );
  if (!res.ok) throw new Error("No se pudo cargar el resumen del portafolio.");
  return res.json();
}

export interface RealizedEvent {
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

export interface DividendEvent {
  externalId: string;
  symbol: string;
  name: string;
  market: string | null;
  currency: string;
  date: string;
  amount: string;
}

export async function fetchRealizedEvents(): Promise<RealizedEvent[]> {
  const res = await fetch(`${API_URL}/portfolio/realized`);
  if (!res.ok) throw new Error("No se pudo cargar el detalle de P&L realizado.");
  return res.json();
}

export async function fetchDividendEvents(): Promise<DividendEvent[]> {
  const res = await fetch(`${API_URL}/portfolio/dividends`);
  if (!res.ok) throw new Error("No se pudo cargar el detalle de dividendos.");
  return res.json();
}

export interface AllocationSlice {
  label: string;
  market: string | null;
  costBasis: string;
  weight: number;
}

export type ValuationBasis = "cost" | "market";

export interface Diversification {
  currency: string;
  basis: ValuationBasis;
  totalInvested: string;
  byPosition: AllocationSlice[];
  byMarket: AllocationSlice[];
  // Sector amplio del emisor. Vacío si el proveedor de perfiles no respondió.
  bySector: AllocationSlice[];
  // País del emisor (ISO-2), que no es el mercado donde cotiza la acción.
  byCountry: AllocationSlice[];
  nonUsWeight: number | null;
  concentration: {
    positionsCount: number;
    topWeight: number;
    top3Weight: number;
    hhi: number;
    effectivePositions: number;
  };
  excludedForMissingQuote: number;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentDetail {
  position: Position;
  isOpen: boolean;
  candles: Candle[];
  quotesConfigured: boolean;
  candlesConfigured: boolean;
}

export interface HistoryPoint {
  month: string;
  invested: string;
  realizedPnL: string;
  dividends: string;
}

export async function fetchDiversification(
  basis: ValuationBasis = "cost",
): Promise<Diversification> {
  const res = await fetch(
    `${API_URL}/portfolio/diversification?basis=${basis}`,
  );
  if (!res.ok) throw new Error("No se pudo cargar la diversificación.");
  return res.json();
}

export async function fetchInstrumentDetail(
  symbol: string,
): Promise<InstrumentDetail> {
  const res = await fetch(
    `${API_URL}/portfolio/instrument/${encodeURIComponent(symbol)}`,
  );
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No hay operaciones para ${symbol}.`
        : "No se pudo cargar el detalle del instrumento.",
    );
  }
  return res.json();
}

export async function fetchHistory(): Promise<HistoryPoint[]> {
  const res = await fetch(`${API_URL}/portfolio/history`);
  if (!res.ok) throw new Error("No se pudo cargar el histórico.");
  return res.json();
}

export async function streamAnalysisAnswer(
  question: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/analysis/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let message = "No se pudo generar el análisis.";
    try {
      const parsed = JSON.parse(text);
      message = parsed?.message ?? message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
