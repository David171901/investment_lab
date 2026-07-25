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

export interface ImportSummary {
  created: number;
  skippedExisting: number;
  errors: { sheet: string; row: number; message: string }[];
}

export async function fetchOperations(): Promise<Operation[]> {
  const res = await fetch(`${API_URL}/operations`);
  if (!res.ok) throw new Error("No se pudieron cargar las operaciones.");
  return res.json();
}

export async function importXtbFile(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/import/xtb`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "Error al importar el archivo.");
  }

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
}

export interface PortfolioSummary {
  currency: string;
  totalInvested: string;
  realizedPnL: string;
  dividendsCollected: string;
  openPositionsCount: number;
  instrumentsCount: number;
}

export async function fetchPositions(): Promise<Position[]> {
  const res = await fetch(`${API_URL}/portfolio/positions`);
  if (!res.ok) throw new Error("No se pudieron cargar las posiciones.");
  return res.json();
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  const res = await fetch(`${API_URL}/portfolio/summary`);
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

export interface Diversification {
  currency: string;
  totalInvested: string;
  byPosition: AllocationSlice[];
  byMarket: AllocationSlice[];
  concentration: {
    positionsCount: number;
    topWeight: number;
    top3Weight: number;
    hhi: number;
    effectivePositions: number;
  };
}

export interface HistoryPoint {
  month: string;
  invested: string;
  realizedPnL: string;
  dividends: string;
}

export async function fetchDiversification(): Promise<Diversification> {
  const res = await fetch(`${API_URL}/portfolio/diversification`);
  if (!res.ok) throw new Error("No se pudo cargar la diversificación.");
  return res.json();
}

export async function fetchHistory(): Promise<HistoryPoint[]> {
  const res = await fetch(`${API_URL}/portfolio/history`);
  if (!res.ok) throw new Error("No se pudo cargar el histórico.");
  return res.json();
}
