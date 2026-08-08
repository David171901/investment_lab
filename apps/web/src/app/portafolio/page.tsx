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
import { InstrumentBadge } from "@/components/instrument-badge";
import { cn } from "@/lib/utils";
import {
  fetchPositions,
  fetchClosedPositions,
  type Position,
  type ClosedPosition,
} from "@/lib/api";
import { formatMoney, formatQuantity } from "@/lib/format";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

const ROW_HOVER = "hover:bg-white/[0.04]";

function pnlClass(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n > 0) return "text-positive";
  if (n < 0) return "text-negative";
  return "text-muted-foreground";
}

// P&L no realizado con su rendimiento %; "—" cuando no hay cotización.
function UnrealizedValue({ position: p }: { position: Position }) {
  if (p.unrealizedPnL == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const n = Number(p.unrealizedPnL);
  return (
    <span className={cn(pnlClass(n), "inline-flex items-center gap-1.5")}>
      {formatMoney(p.unrealizedPnL, p.currency)}
      {p.returnPct != null && (
        <span className="text-[11px] opacity-80">
          ({p.returnPct >= 0 ? "+" : ""}
          {p.returnPct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

// P&L realizado de un ciclo cerrado, con su % de retorno; "—" cuando el costo
// base es despreciable (mismo criterio que `UnrealizedValue`).
function ClosedReturnValue({ position: c }: { position: ClosedPosition }) {
  const n = Number(c.realizedPnL);
  return (
    <span className={cn(pnlClass(n), "inline-flex items-center gap-1.5")}>
      {formatMoney(c.realizedPnL, c.currency)}
      {c.returnPct != null && (
        <span className="text-[11px] opacity-80">
          ({c.returnPct >= 0 ? "+" : ""}
          {c.returnPct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export default function PortafolioPage() {
  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions"],
    // Envuelto en arrow: pasar `fetchPositions` directo haría que TanStack le
    // mande su objeto de contexto como argumento `refresh` (truthy) y forzara
    // consulta al proveedor en cada carga.
    queryFn: () => fetchPositions(),
  });

  const closedPositionsQuery = useQuery({
    queryKey: ["portfolio-closed-positions"],
    queryFn: fetchClosedPositions,
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
                      <TableHead className="text-right">Precio actual</TableHead>
                      <TableHead className="text-right">Valor mercado</TableHead>
                      <TableHead className="text-right">
                        P&amp;L no realizado
                      </TableHead>
                      <TableHead className="text-right">Dividendos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((p) => (
                      <TableRow key={p.symbol} className={ROW_HOVER}>
                        <TableCell>
                          <Link
                            href={`/portafolio/${encodeURIComponent(p.symbol)}`}
                            className="inline-flex hover:opacity-80"
                          >
                            <InstrumentBadge
                              symbol={p.symbol}
                              name={p.name}
                              logoUrl={p.logoUrl}
                            />
                          </Link>
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
                          {p.marketPrice ? (
                            <span
                              className={cn(
                                p.quoteStale && "text-muted-foreground",
                              )}
                              title={
                                p.quoteStale
                                  ? "Último precio conocido (el proveedor no respondió)"
                                  : undefined
                              }
                            >
                              {formatMoney(p.marketPrice, p.currency)}
                              {p.quoteStale && " *"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.marketValue ? (
                            formatMoney(p.marketValue, p.currency)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <UnrealizedValue position={p} />
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
                    {filteredPositions.length === 0 && <EmptyRow colSpan={9} />}
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

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-medium">Empresas que poseías</h2>
          <p className="text-[13px] text-muted-foreground">
            Ciclos de compra-venta ya cerrados, más reciente primero
          </p>
        </div>

        {closedPositionsQuery.isError && (
          <p className="text-negative">
            No se pudo cargar el historial de posiciones cerradas.
          </p>
        )}
        {closedPositionsQuery.isLoading && (
          <p className="text-muted-foreground">Cargando historial...</p>
        )}
        {closedPositionsQuery.data && closedPositionsQuery.data.length === 0 && (
          <p className="text-muted-foreground">
            Todavía no cerraste ninguna posición por completo.
          </p>
        )}

        {closedPositionsQuery.data && closedPositionsQuery.data.length > 0 && (
          <Card className="py-4">
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className={ROW_HOVER}>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Mercado</TableHead>
                    <TableHead className="text-right">Apertura</TableHead>
                    <TableHead className="text-right">Cierre</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio prom. compra</TableHead>
                    <TableHead className="text-right">Precio prom. venta</TableHead>
                    <TableHead className="text-right">P&amp;L realizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedPositionsQuery.data.map((c, i) => (
                    <TableRow key={`${c.symbol}-${c.closeDate}-${i}`} className={ROW_HOVER}>
                      <TableCell>
                        <Link
                          href={`/portafolio/${encodeURIComponent(c.symbol)}`}
                          className="inline-flex hover:opacity-80"
                        >
                          <InstrumentBadge
                            symbol={c.symbol}
                            name={c.name}
                            logoUrl={c.logoUrl}
                          />
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.market ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatDate(c.openDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatDate(c.closeDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(c.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.averageBuyPrice, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.averageSellPrice, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ClosedReturnValue position={c} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
      label: "Valor mercado",
      node: p.marketValue ? (
        formatMoney(p.marketValue, p.currency)
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      label: "P&L no realizado",
      node: <UnrealizedValue position={p} />,
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
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/portafolio/${encodeURIComponent(p.symbol)}`}
            className="min-w-0 hover:opacity-80"
          >
            <InstrumentBadge
              symbol={p.symbol}
              name={p.name}
              logoUrl={p.logoUrl}
            />
          </Link>
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
