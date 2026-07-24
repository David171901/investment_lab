"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOperations, importXtbFile, type ImportSummary } from "@/lib/api";

export default function OperacionesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const operationsQuery = useQuery({
    queryKey: ["operations"],
    queryFn: fetchOperations,
  });

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Operaciones</h1>
        <Link href="/">
          <Button variant="outline">← Dashboard</Button>
        </Link>
      </header>

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
            {operationsQuery.data.map((op) => (
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
          </TableBody>
        </Table>
      )}
    </div>
  );
}
