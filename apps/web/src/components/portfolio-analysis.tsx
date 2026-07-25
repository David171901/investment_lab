"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDiversification, fetchHistory } from "@/lib/api";
import { formatMoney } from "@/lib/format";

// Paleta validada contra la superficie de la card (#232532) con el script del
// skill dataviz: trío categórico #3987e5/#d95926/#199e70 y series de una sola
// serie en el acento de marca (#9184d9), todas ≥ 3:1 de contraste.
const ACCENT = "#9184d9";
const SERIES_REALIZED = "#3987e5";
const SERIES_DIVIDENDS = "#199e70";
const MARKET_COLORS = ["#3987e5", "#d95926", "#199e70"];
const MARKET_OTHER = "rgba(233,233,237,0.35)";
const AXIS = "#8b8ea0";
const GRID = "rgba(233,233,237,0.08)";

const KICKER =
  "text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground";
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function fmtMonth(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y.slice(2)}`;
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: unknown }[];
  label?: string | number;
  currency: string;
  labelFormatter?: (v: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const heading =
    labelFormatter && typeof label === "string" ? labelFormatter(label) : label;
  return (
    <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
      {heading !== undefined && (
        <div className="mb-1 text-muted-foreground">{heading}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {formatMoney(p.value ?? 0, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConcentrationTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1">
        <span className={KICKER}>{label}</span>
        <span className="text-2xl font-medium tabular-nums">{value}</span>
        <span className="text-[12px] text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}

export function PortfolioAnalysis() {
  const divQuery = useQuery({
    queryKey: ["portfolio-diversification"],
    queryFn: fetchDiversification,
  });
  const historyQuery = useQuery({
    queryKey: ["portfolio-history"],
    queryFn: fetchHistory,
  });

  const div = divQuery.data;
  const currency = div?.currency ?? "USD";

  const positionData = useMemo(
    () =>
      (div?.byPosition ?? []).map((p) => ({
        label: p.label,
        weight: Number(p.weight),
        costBasis: Number(p.costBasis),
      })),
    [div],
  );

  const history = useMemo(
    () =>
      (historyQuery.data ?? []).map((h) => ({
        month: h.month,
        invested: Number(h.invested),
        realizedPnL: Number(h.realizedPnL),
        dividends: Number(h.dividends),
      })),
    [historyQuery.data],
  );

  const barHeight = Math.max(220, positionData.length * 30 + 40);

  return (
    <>
      {/* Diversificación y riesgo */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-medium">Diversificación y riesgo</h2>
          <p className="text-[13px] text-muted-foreground">
            Peso de cada posición sobre el capital invertido (a costo)
          </p>
        </div>

        {divQuery.isError && (
          <p className="text-negative">No se pudo cargar la diversificación.</p>
        )}

        {div && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <ConcentrationTile
                label="Posiciones abiertas"
                value={String(div.concentration.positionsCount)}
                sub="instrumentos en cartera"
              />
              <ConcentrationTile
                label="Posición más grande"
                value={`${div.concentration.topWeight.toFixed(1)}%`}
                sub="del total invertido"
              />
              <ConcentrationTile
                label="Top 3 posiciones"
                value={`${div.concentration.top3Weight.toFixed(1)}%`}
                sub="concentración en las 3 mayores"
              />
              <ConcentrationTile
                label="Posiciones efectivas"
                value={div.concentration.effectivePositions.toFixed(1)}
                sub="equivalentes equiponderadas (HHI)"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Peso por posición */}
              <Card className="py-5 lg:col-span-2">
                <CardContent className="flex flex-col gap-3">
                  <span className={KICKER}>Peso por posición</span>
                  <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart
                      data={positionData}
                      layout="vertical"
                      margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
                    >
                      <CartesianGrid horizontal={false} stroke={GRID} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fill: AXIS, fontSize: 12 }}
                        axisLine={{ stroke: GRID }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={74}
                        tick={{ fill: AXIS, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as {
                            weight: number;
                            costBasis: number;
                          };
                          return (
                            <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
                              <div className="mb-1 font-medium">{label}</div>
                              <div className="tabular-nums text-muted-foreground">
                                {row.weight.toFixed(1)}% ·{" "}
                                {formatMoney(row.costBasis, currency)}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="weight"
                        fill={ACCENT}
                        radius={[0, 4, 4, 0]}
                        maxBarSize={18}
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="weight"
                          position="right"
                          formatter={(v) =>
                            v == null ? "" : `${Number(v).toFixed(1)}%`
                          }
                          fill={AXIS}
                          fontSize={11}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Por mercado */}
              <Card className="py-5">
                <CardContent className="flex flex-col gap-4">
                  <span className={KICKER}>Por mercado</span>
                  <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.04]">
                    {div.byMarket.map((m, i) => (
                      <div
                        key={m.label}
                        style={{
                          width: `${m.weight}%`,
                          background:
                            i < MARKET_COLORS.length
                              ? MARKET_COLORS[i]
                              : MARKET_OTHER,
                        }}
                        title={`${m.label} ${m.weight.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <ul className="flex flex-col gap-2 text-sm">
                    {div.byMarket.map((m, i) => (
                      <li key={m.label} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-[3px]"
                          style={{
                            background:
                              i < MARKET_COLORS.length
                                ? MARKET_COLORS[i]
                                : MARKET_OTHER,
                          }}
                        />
                        <span>{m.label}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {m.weight.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* Evolución */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-medium">Evolución</h2>
          <p className="text-[13px] text-muted-foreground">
            Derivado de tus operaciones (a costo, sin precios de mercado)
          </p>
        </div>

        {historyQuery.isError && (
          <p className="text-negative">No se pudo cargar el histórico.</p>
        )}

        {history.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Capital invertido */}
            <Card className="py-5">
              <CardContent className="flex flex-col gap-3">
                <span className={KICKER}>Capital invertido</span>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart
                    data={history}
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  >
                    <defs>
                      <linearGradient id="fillInvested" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={fmtMonth}
                      tick={{ fill: AXIS, fontSize: 12 }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tickFormatter={fmtCompact}
                      tick={{ fill: AXIS, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip
                      content={(props) => (
                        <ChartTooltip
                          active={props.active}
                          payload={
                            props.payload as unknown as {
                              name?: string;
                              value?: number;
                              color?: string;
                            }[]
                          }
                          label={props.label as string}
                          currency={currency}
                          labelFormatter={fmtMonth}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="invested"
                      name="Invertido"
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#fillInvested)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* P&L realizado y dividendos acumulados */}
            <Card className="py-5">
              <CardContent className="flex flex-col gap-3">
                <span className={KICKER}>
                  P&amp;L realizado y dividendos acumulados
                </span>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={history}
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={fmtMonth}
                      tick={{ fill: AXIS, fontSize: 12 }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tickFormatter={fmtCompact}
                      tick={{ fill: AXIS, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <ReferenceLine y={0} stroke={GRID} />
                    <Tooltip
                      content={(props) => (
                        <ChartTooltip
                          active={props.active}
                          payload={
                            props.payload as unknown as {
                              name?: string;
                              value?: number;
                              color?: string;
                            }[]
                          }
                          label={props.label as string}
                          currency={currency}
                          labelFormatter={fmtMonth}
                        />
                      )}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: AXIS }}
                      iconType="plainline"
                    />
                    <Line
                      type="monotone"
                      dataKey="realizedPnL"
                      name="P&L realizado"
                      stroke={SERIES_REALIZED}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="dividends"
                      name="Dividendos"
                      stroke={SERIES_DIVIDENDS}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </>
  );
}
