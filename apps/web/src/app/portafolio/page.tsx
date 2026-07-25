"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fetchPositions, type Position } from "@/lib/api";
import { formatMoney, formatQuantity } from "@/lib/format";

const ROW_HOVER = "hover:bg-white/[0.04]";

function pnlClass(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n > 0) return "text-positive";
  if (n < 0) return "text-negative";
  return "text-muted-foreground";
}

function PnlValue({ value, currency }: { value: string; currency: string }) {
  const n = Number(value);
  if (n === 0) return <span className="text-muted-foreground">—</span>;
  return <span className={pnlClass(n)}>{formatMoney(value, currency)}</span>;
}

export default function PortafolioPage() {
  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions"],
    queryFn: fetchPositions,
  });

  const [view, setView] = useState<"table" | "cards">("table");
  const [positionFilter, setPositionFilter] = useState("");

  const filteredPositions = useMemo(() => {
    const q = positionFilter.trim().toLowerCase();
    const data = positionsQuery.data ?? [];
    if (!q) return data;
    return data.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        (p.market ?? "").toLowerCase().includes(q),
    );
  }, [positionsQuery.data, positionFilter]);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] min-h-screen flex-col gap-12 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Portafolio</span>
        <span className="text-[13px] text-muted-foreground">
          Empresas que posees — detalle completo de posiciones abiertas
        </span>
      </nav>

      {positionsQuery.isError && (
        <p className="text-negative">No se pudieron cargar las posiciones.</p>
      )}

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-medium">Empresas que posees</h2>
            <p className="text-[13px] text-muted-foreground">
              Posiciones abiertas ordenadas por peso en el portafolio
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Filtrar por símbolo o mercado..."
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-[220px]"
            />
            <div className="inline-flex items-center rounded-lg border border-border p-0.5 text-sm">
              {(["table", "cards"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 transition-colors",
                    view === v
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "table" ? "Tabla" : "Tarjetas"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {positionsQuery.isLoading && (
          <p className="text-muted-foreground">Cargando posiciones...</p>
        )}
        {positionsQuery.data && positionsQuery.data.length === 0 && (
          <p className="text-muted-foreground">
            No hay posiciones abiertas. Importá operaciones desde{" "}
            <Link href="/operaciones" className="underline">
              Operaciones
            </Link>
            .
          </p>
        )}

        {positionsQuery.data &&
          positionsQuery.data.length > 0 &&
          view === "table" && (
            <Card className="py-4">
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className={ROW_HOVER}>
                      <TableHead>Símbolo</TableHead>
                      <TableHead>Mercado</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo medio</TableHead>
                      <TableHead className="text-right">Invertido</TableHead>
                      <TableHead className="text-right">P&amp;L</TableHead>
                      <TableHead className="text-right">Dividendos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((p) => (
                      <TableRow key={p.symbol} className={ROW_HOVER}>
                        <TableCell className="font-medium">
                          {p.symbol}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.market ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(p.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(p.averageCost, p.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(p.costBasis, p.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <PnlValue
                            value={p.realizedPnL}
                            currency={p.currency}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(p.dividendsCollected) > 0 ? (
                            <span className="text-positive">
                              {formatMoney(p.dividendsCollected, p.currency)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPositions.length === 0 && <EmptyRow colSpan={7} />}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

        {positionsQuery.data &&
          positionsQuery.data.length > 0 &&
          view === "cards" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {filteredPositions.map((p) => (
                <PositionCard key={p.symbol} position={p} />
              ))}
              {filteredPositions.length === 0 && (
                <p className="text-muted-foreground">Sin resultados.</p>
              )}
            </div>
          )}
      </section>
    </div>
  );
}

function PositionCard({ position: p }: { position: Position }) {
  const rows: { label: string; node: React.ReactNode }[] = [
    { label: "Cantidad", node: formatQuantity(p.quantity) },
    { label: "Costo medio", node: formatMoney(p.averageCost, p.currency) },
    { label: "Invertido", node: formatMoney(p.costBasis, p.currency) },
    {
      label: "P&L",
      node: <PnlValue value={p.realizedPnL} currency={p.currency} />,
    },
    {
      label: "Dividendos",
      node:
        Number(p.dividendsCollected) > 0 ? (
          <span className="text-positive">
            {formatMoney(p.dividendsCollected, p.currency)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <Card className="gap-3 py-5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">{p.symbol}</span>
          {p.market && (
            <span className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">
              {p.market}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <span className="tabular-nums">{r.node}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="text-center text-muted-foreground"
      >
        Sin resultados.
      </TableCell>
    </TableRow>
  );
}
