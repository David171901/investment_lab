"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandlestickChart } from "@/components/candlestick-chart";
import { InstrumentBadge } from "@/components/instrument-badge";
import { cn } from "@/lib/utils";
import { fetchInstrumentDetail } from "@/lib/api";
import { formatMoney, formatQuantity } from "@/lib/format";

const KICKER =
  "text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground";

function pnlClass(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

function Tile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1">
        <span className={KICKER}>{label}</span>
        <span className={cn("text-2xl font-medium tabular-nums", valueClass)}>
          {value}
        </span>
        {sub && (
          <span className="text-[12px] text-muted-foreground">{sub}</span>
        )}
      </CardContent>
    </Card>
  );
}

export default function InstrumentDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = use(params);
  const symbol = decodeURIComponent(rawSymbol);

  const detailQuery = useQuery({
    queryKey: ["instrument-detail", symbol],
    queryFn: () => fetchInstrumentDetail(symbol),
  });

  const detail = detailQuery.data;
  const p = detail?.position;
  const currency = p?.currency ?? "USD";

  const unrealized = p?.unrealizedPnL != null ? Number(p.unrealizedPnL) : null;
  const realized = p ? Number(p.realizedPnL) : 0;
  const dividends = p ? Number(p.dividendsCollected) : 0;

  return (
    <div className="mx-auto flex w-full min-h-screen max-w-[1180px] flex-col gap-8 px-6 py-8">
      <nav className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <InstrumentBadge
            symbol={symbol}
            name={p?.name}
            logoUrl={p?.logoUrl}
            size="lg"
          />
          <span className="text-[13px] text-muted-foreground">
            {detail?.isOpen === false
              ? "Posición cerrada — historial de operaciones"
              : "Detalle de la posición"}
          </span>
        </div>
        <Link href="/portafolio">
          <Button variant="outline">← Portafolio</Button>
        </Link>
      </nav>

      {detailQuery.isLoading && (
        <p className="text-muted-foreground">Cargando instrumento...</p>
      )}
      {detailQuery.isError && (
        <p className="text-negative">
          {(detailQuery.error as Error).message}
        </p>
      )}

      {p && (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile
              label="Cantidad"
              value={formatQuantity(p.quantity)}
              sub={`costo medio ${formatMoney(p.averageCost, currency)}`}
            />
            <Tile
              label="Invertido"
              value={formatMoney(p.costBasis, currency)}
              sub="a costo de compra"
            />
            <Tile
              label="Valor de mercado"
              value={
                p.marketValue ? formatMoney(p.marketValue, currency) : "—"
              }
              sub={
                p.marketPrice
                  ? `${formatMoney(p.marketPrice, currency)} por unidad${p.quoteStale ? " (desactualizado)" : ""}`
                  : "sin cotización disponible"
              }
            />
            <Tile
              label="P&L no realizado"
              value={
                unrealized != null
                  ? formatMoney(unrealized, currency)
                  : "—"
              }
              valueClass={unrealized != null ? pnlClass(unrealized) : undefined}
              sub={
                p.returnPct != null
                  ? `${p.returnPct >= 0 ? "▲" : "▼"} ${Math.abs(p.returnPct).toFixed(2)}% sobre el costo`
                  : "requiere cotización"
              }
            />
          </section>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile
              label="P&L realizado"
              value={realized !== 0 ? formatMoney(realized, currency) : "—"}
              valueClass={pnlClass(realized)}
              sub="de ventas ya cerradas"
            />
            <Tile
              label="Dividendos"
              value={dividends > 0 ? formatMoney(dividends, currency) : "—"}
              valueClass={dividends > 0 ? "text-positive" : undefined}
              sub="cobrados a la fecha"
            />
          </section>

          <section>
            <Card className="py-5">
              <CardContent>
                {detail.candles.length > 0 ? (
                  <CandlestickChart
                    candles={detail.candles}
                    currency={currency}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {detail.candlesConfigured
                      ? `No hay datos históricos disponibles para ${symbol} en el proveedor de velas.`
                      : "Configurá TWELVEDATA_API_KEY en apps/api/.env para ver el gráfico de velas."}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
