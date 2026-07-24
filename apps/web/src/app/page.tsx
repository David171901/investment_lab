"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchPortfolioSummary, fetchPositions } from "@/lib/api";
import { formatMoney, formatQuantity } from "@/lib/format";

function pnlColor(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-red-400";
  return "text-muted-foreground";
}

export default function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: fetchPortfolioSummary,
  });
  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions"],
    queryFn: fetchPositions,
  });

  const summary = summaryQuery.data;
  const currency = summary?.currency ?? "USD";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Investment Lab</h1>
          <p className="text-sm text-muted-foreground">
            Resumen de tu portafolio
          </p>
        </div>
        <Link href="/operaciones">
          <Button variant="outline">Ver operaciones</Button>
        </Link>
      </header>

      {summaryQuery.isError && (
        <p className="text-red-400">
          No se pudo cargar el resumen. ¿Está la API corriendo?
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total invertido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {summary ? formatMoney(summary.totalInvested, currency) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary
                ? `${summary.openPositionsCount} posiciones abiertas`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              P&amp;L realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-semibold ${
                summary ? pnlColor(summary.realizedPnL) : ""
              }`}
            >
              {summary ? formatMoney(summary.realizedPnL, currency) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              De operaciones ya cerradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dividendos cobrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-400">
              {summary
                ? formatMoney(summary.dividendsCollected, currency)
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Ingreso de caja</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Instrumentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {summary ? summary.instrumentsCount : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Operados en total
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Empresas que posees</h2>

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

        {positionsQuery.data && positionsQuery.data.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Símbolo</TableHead>
                    <TableHead>Mercado</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo medio</TableHead>
                    <TableHead className="text-right">Invertido</TableHead>
                    <TableHead className="text-right">Dividendos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positionsQuery.data.map((p) => (
                    <TableRow key={p.symbol}>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.market ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(p.quantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(p.averageCost, p.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(p.costBasis, p.currency)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-400">
                        {Number(p.dividendsCollected) > 0
                          ? formatMoney(p.dividendsCollected, p.currency)
                          : "—"}
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
