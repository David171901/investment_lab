"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOperations, importXtbFile, type ImportSummary } from "@/lib/api";

type TypeFilter = "ALL" | "BUY" | "SELL" | "DIVIDEND";

export default function OperacionesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const operationsQuery = useQuery({
    queryKey: ["operations"],
    queryFn: fetchOperations,
  });

  const filteredOperations = useMemo(() => {
    const q = symbolFilter.trim().toLowerCase();
    const data = operationsQuery.data ?? [];
    return data.filter((op) => {
      const matchesType = typeFilter === "ALL" || op.type === typeFilter;
      const matchesSymbol =
        !q || op.instrument.symbol.toLowerCase().includes(q);
      return matchesType && matchesSymbol;
    });
  }, [operationsQuery.data, symbolFilter, typeFilter]);

  const importMutation = useMutation({
    mutationFn: importXtbFile,
    onSuccess: (result) => {
      setSummary(result);
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setSummary(null);
    importMutation.mutate(file);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Operaciones</span>
        <span className="text-[13px] text-muted-foreground">
          Historial importado desde XTB
        </span>
      </nav>

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="text-sm"
        />
        <Button type="submit" disabled={importMutation.isPending}>
          {importMutation.isPending ? "Importando..." : "Importar archivo XTB"}
        </Button>
      </form>

      {importMutation.isError && (
        <p className="text-sm text-red-600">
          {(importMutation.error as Error).message}
        </p>
      )}

      {summary && (
        <div className="rounded-md border p-3 text-sm">
          <p>
            Creadas: {summary.created} — Ya existentes:{" "}
            {summary.skippedExisting}
          </p>
          {summary.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600">
                {summary.errors.length} fila(s) con errores
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    {e.sheet} (fila {e.row}): {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {operationsQuery.isLoading && <p>Cargando operaciones...</p>}
      {operationsQuery.isError && (
        <p className="text-red-600">No se pudieron cargar las operaciones.</p>
      )}

      {operationsQuery.data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Filtrar por símbolo..."
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
            </select>
            <span className="text-sm text-muted-foreground">
              {filteredOperations.length} de {operationsQuery.data.length}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Comisión</TableHead>
                <TableHead>Moneda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOperations.map((op) => (
                <TableRow key={op.id}>
                  <TableCell>{new Date(op.date).toLocaleString()}</TableCell>
                  <TableCell>{op.instrument.symbol}</TableCell>
                  <TableCell>{op.type}</TableCell>
                  <TableCell>{op.quantity}</TableCell>
                  <TableCell>{op.price}</TableCell>
                  <TableCell>{op.commission}</TableCell>
                  <TableCell>{op.currency}</TableCell>
                </TableRow>
              ))}
              {filteredOperations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    Sin resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
