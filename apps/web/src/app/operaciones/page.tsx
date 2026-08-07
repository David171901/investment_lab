"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOperations } from "@/lib/api";

type TypeFilter = "ALL" | "BUY" | "SELL" | "DIVIDEND";

export default function OperacionesPage() {
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

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Operaciones</span>
        <span className="text-[13px] text-muted-foreground">
          Historial importado desde XTB
        </span>
      </nav>

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
