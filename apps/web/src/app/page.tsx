"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchDividendEvents,
  fetchPortfolioSummary,
  fetchPositions,
  fetchRealizedEvents,
} from "@/lib/api";
import { formatMoney, formatQuantity } from "@/lib/format";

const KICKER =
  "text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground";
const ROW_HOVER = "hover:bg-white/[0.04]";
const DETAIL_BTN =
  "ml-auto text-[13px] text-[var(--accent)] underline underline-offset-2 transition hover:brightness-125";
const TOP_POSITIONS_COUNT = 5;

type DialogKind = "realized" | "dividends" | null;

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: () => fetchPortfolioSummary(),
  });
  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions"],
    queryFn: () => fetchPositions(),
  });
  const realizedQuery = useQuery({
    queryKey: ["portfolio-realized"],
    queryFn: fetchRealizedEvents,
  });
  const dividendsQuery = useQuery({
    queryKey: ["portfolio-dividends"],
    queryFn: fetchDividendEvents,
  });

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [updatedAt] = useState(() =>
    new Date().toLocaleString("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  // Fuerza consulta al proveedor ignorando el cache, y siembra el resultado en
  // TanStack Query para que la UI lo tome sin un refetch extra.
  const refreshPrices = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [freshSummary, freshPositions] = await Promise.all([
        fetchPortfolioSummary(true),
        fetchPositions(true),
      ]);
      queryClient.setQueryData(["portfolio-summary"], freshSummary);
      queryClient.setQueryData(["portfolio-positions"], freshPositions);
      // La diversificación a valor de mercado deriva de las mismas cotizaciones.
      queryClient.invalidateQueries({ queryKey: ["portfolio-diversification"] });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const summary = summaryQuery.data;
  const currency = summary?.currency ?? "USD";

  const invested = Number(summary?.totalInvested ?? 0);
  const realizedTotal = Number(summary?.realizedPnL ?? 0);
  const pnlPct = invested > 0 ? (realizedTotal / invested) * 100 : 0;

  const realizedEvents = realizedQuery.data ?? [];
  const dividendEvents = dividendsQuery.data ?? [];

  const topPositions = useMemo(() => {
    const data = positionsQuery.data ?? [];
    return [...data]
      .sort((a, b) => Number(b.costBasis) - Number(a.costBasis))
      .slice(0, TOP_POSITIONS_COUNT);
  }, [positionsQuery.data]);

  const totalPositions = positionsQuery.data?.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] min-h-screen flex-col gap-12 px-6 py-8">
      {/* 1. Nav superior */}
      <nav className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-medium">Dashboard</span>
          <span className="text-[13px] text-muted-foreground">
            Resumen general del portafolio
          </span>
        </div>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">
            Actualizado {updatedAt}
          </span>
        )}
      </nav>

      {summaryQuery.isError && (
        <p className="text-negative">
          No se pudo cargar el resumen. ¿Está la API corriendo?
        </p>
      )}

      {/* 2. Hero stats */}
      <section className="hero-stats">
        {/* Total invertido — primary */}
        <Card className="stat-primary gap-2 py-6 shadow-sm">
          <CardContent className="flex flex-col gap-2">
            <span className={KICKER}>Total invertido</span>
            <span className="text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums">
              {summary ? formatMoney(summary.totalInvested, currency) : "—"}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {summary
                ? `${summary.openPositionsCount} posiciones abiertas · ${summary.instrumentsCount} instrumentos`
                : " "}
            </span>
          </CardContent>
        </Card>

        {/* P&L realizado — primary */}
        <Card className="stat-primary gap-2 py-6 shadow-sm">
          <CardContent className="flex flex-col gap-2">
            <span className={KICKER}>P&amp;L realizado</span>
            <span
              className={cn(
                "text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums",
                summary && pnlClass(summary.realizedPnL),
              )}
            >
              {summary ? formatMoney(summary.realizedPnL, currency) : "—"}
            </span>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {summary && (
                <span className={pnlClass(realizedTotal)}>
                  {realizedTotal >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}
                  %
                </span>
              )}
              <span>sobre lo invertido</span>
              <button
                type="button"
                onClick={() => setDialog("realized")}
                className={DETAIL_BTN}
              >
                Ver movimientos
                {realizedQuery.data ? ` (${realizedEvents.length})` : ""}
              </button>
            </span>
          </CardContent>
        </Card>

        {/* Dividendos — normal */}
        <Card className="gap-2 py-6">
          <CardContent className="flex flex-col gap-2">
            <span className={KICKER}>Dividendos</span>
            <span className="text-[26px] leading-none font-medium tabular-nums text-positive">
              {summary
                ? formatMoney(summary.dividendsCollected, currency)
                : "—"}
            </span>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span>cobrados a la fecha</span>
              <button
                type="button"
                onClick={() => setDialog("dividends")}
                className={DETAIL_BTN}
              >
                Ver movimientos
                {dividendsQuery.data ? ` (${dividendEvents.length})` : ""}
              </button>
            </span>
          </CardContent>
        </Card>

        {/* Instrumentos — normal */}
        <Card className="gap-2 py-6">
          <CardContent className="flex flex-col gap-2">
            <span className={KICKER}>Instrumentos</span>
            <span className="text-[26px] leading-none font-medium tabular-nums">
              {summary ? summary.instrumentsCount : "—"}
            </span>
            <span className="text-[13px] text-muted-foreground">
              operados en total
            </span>
          </CardContent>
        </Card>
      </section>

      {/* 2b. Valuación a mercado (Fase 3.5) — fila aparte para no alterar la
          grilla de hero-stats; si no hay cotizaciones muestra cómo activarlas. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-medium">Valuación a mercado</h2>
            <p className="text-[13px] text-muted-foreground">
              {summary?.quotesConfigured
                ? `Precio actual de ${summary.positionsWithQuote} de ${summary.openPositionsCount} posiciones` +
                  (summary.positionsWithoutQuote > 0
                    ? ` · ${summary.positionsWithoutQuote} sin cotización disponible`
                    : "")
                : "Requiere un proveedor de cotizaciones configurado"}
            </p>
          </div>
          {summary?.quotesConfigured && (
            <Button
              variant="outline"
              onClick={() => void refreshPrices()}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Actualizando..." : "Actualizar precios"}
            </Button>
          )}
        </div>

        {summary && !summary.quotesConfigured && (
          <Card className="py-4">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurá{" "}
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px]">
                  FINNHUB_API_KEY
                </code>{" "}
                en <code className="text-[12px]">apps/api/.env</code>{" "}
                para ver el valor actual de tu portafolio y el P&amp;L no
                realizado. Sin eso, todo se muestra a costo de compra.
              </p>
            </CardContent>
          </Card>
        )}

        {summary?.marketValue && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Card className="gap-2 py-5">
              <CardContent className="flex flex-col gap-1.5">
                <span className={KICKER}>Valor de mercado</span>
                <span className="text-[26px] leading-none font-medium tabular-nums">
                  {formatMoney(summary.marketValue, currency)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  hoy, a precio de mercado
                </span>
              </CardContent>
            </Card>

            <Card className="gap-2 py-5">
              <CardContent className="flex flex-col gap-1.5">
                <span className={KICKER}>P&amp;L no realizado</span>
                <span
                  className={cn(
                    "text-[26px] leading-none font-medium tabular-nums",
                    pnlClass(summary.unrealizedPnL ?? 0),
                  )}
                >
                  {formatMoney(summary.unrealizedPnL ?? 0, currency)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {summary.returnPct != null && (
                    <span className={pnlClass(summary.returnPct)}>
                      {summary.returnPct >= 0 ? "▲" : "▼"}{" "}
                      {Math.abs(summary.returnPct).toFixed(2)}%{" "}
                    </span>
                  )}
                  sobre el costo
                </span>
              </CardContent>
            </Card>

            <Card className="gap-2 py-5">
              <CardContent className="flex flex-col gap-1.5">
                <span className={KICKER}>P&amp;L total</span>
                <span
                  className={cn(
                    "text-[26px] leading-none font-medium tabular-nums",
                    pnlClass(summary.totalPnL ?? 0),
                  )}
                >
                  {formatMoney(summary.totalPnL ?? 0, currency)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  realizado + no realizado + dividendos
                </span>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* 3. Top posiciones — vista compacta, detalle completo en /portafolio */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-medium">Top posiciones</h2>
            <p className="text-[13px] text-muted-foreground">
              Las {TOP_POSITIONS_COUNT} mayores posiciones por capital invertido
            </p>
          </div>
          <Link href="/portafolio">
            <Button variant="outline">
              Ver portafolio completo
              {totalPositions ? ` (${totalPositions})` : ""}
            </Button>
          </Link>
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

        {topPositions.length > 0 && (
          <Card className="py-4">
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className={ROW_HOVER}>
                    <TableHead>Símbolo</TableHead>
                    <TableHead>Mercado</TableHead>
                    <TableHead className="text-right">Invertido</TableHead>
                    <TableHead className="text-right">P&amp;L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPositions.map((p) => (
                    <TableRow key={p.symbol} className={ROW_HOVER}>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.market ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.costBasis, p.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <PnlValue value={p.realizedPnL} currency={p.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Modal: movimientos de P&L realizado */}
      <DetailModal
        open={dialog === "realized"}
        onClose={closeDialog}
        title="Movimientos de P&L realizado"
        subtitle="Cada venta cerrada, con su resultado individual"
      >
        <Table>
          <TableHeader>
            <TableRow className={ROW_HOVER}>
              <TableHead>Fecha</TableHead>
              <TableHead>Símbolo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio venta</TableHead>
              <TableHead className="text-right">Costo medio</TableHead>
              <TableHead className="text-right">P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {realizedEvents.map((e) => (
              <TableRow key={e.externalId} className={ROW_HOVER}>
                <TableCell className="text-muted-foreground">
                  {formatDate(e.date)}
                </TableCell>
                <TableCell className="font-medium">{e.symbol}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(e.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(e.sellPrice, e.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(e.averageCost, e.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  <PnlValue value={e.realizedPnL} currency={e.currency} />
                </TableCell>
              </TableRow>
            ))}
            {realizedEvents.length === 0 && <EmptyRow colSpan={6} />}
          </TableBody>
        </Table>
      </DetailModal>

      {/* Modal: dividendos cobrados */}
      <DetailModal
        open={dialog === "dividends"}
        onClose={closeDialog}
        title="Dividendos cobrados"
        subtitle="Historial de pagos por instrumento"
      >
        <Table>
          <TableHeader>
            <TableRow className={ROW_HOVER}>
              <TableHead>Fecha</TableHead>
              <TableHead>Símbolo</TableHead>
              <TableHead>Mercado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dividendEvents.map((e) => (
              <TableRow key={e.externalId} className={ROW_HOVER}>
                <TableCell className="text-muted-foreground">
                  {formatDate(e.date)}
                </TableCell>
                <TableCell className="font-medium">{e.symbol}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.market ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-positive">
                  {formatMoney(e.amount, e.currency)}
                </TableCell>
              </TableRow>
            ))}
            {dividendEvents.length === 0 && <EmptyRow colSpan={4} />}
          </TableBody>
        </Table>
      </DetailModal>
    </div>
  );
}

function DetailModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82vh] w-[min(720px,100%)] flex-col gap-4 rounded-xl bg-card p-6 shadow-lg ring-1 ring-white/10"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 flex-none place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
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
