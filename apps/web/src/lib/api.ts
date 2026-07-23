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
