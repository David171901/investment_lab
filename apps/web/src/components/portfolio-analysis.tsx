"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchDiversification,
  fetchDividendEvents,
  fetchHistory,
  fetchPositions,
  type ValuationBasis,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";

// Paleta validada contra la superficie de la card (#232532) con el script del
// skill dataviz: trío categórico #3987e5/#d95926/#199e70 y series de una sola
// serie en el acento de marca (#9184d9), todas ≥ 3:1 de contraste.
const ACCENT = "#9184d9";
const SERIES_REALIZED = "#3987e5";
const SERIES_DIVIDENDS = "#199e70";
const AXIS = "#8b8ea0";
const GRID = "rgba(233,233,237,0.08)";

// Cinco tonos categóricos para el donut de sectores. Validados juntos contra
// la superficie de la card: banda de luminosidad, croma, separación para
// daltonismo (peor par ΔE 9.4 deutan), visión normal (ΔE 22.9) y contraste.
// El orden es fijo y NO se cicla: un sexto sector cae en SECTOR_OTHER.
const SECTOR_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#9184d9",
  "#b8862b",
] as const;
const SECTOR_OTHER = "rgba(233,233,237,0.35)";

// Par divergente para rendimiento y P&L. Mismos tonos que las velas.
const POSITIVE = "#199e70";
const NEGATIVE = "#d95926";

// Color de la superficie de la card: se usa como borde de las porciones del
// donut para dejar el separador de 2px entre rellenos contiguos.
const SURFACE = "#232532";

function sectorColor(index: number): string {
  return index < SECTOR_COLORS.length ? SECTOR_COLORS[index] : SECTOR_OTHER;
}

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

/**
 * Barra horizontal con el extremo de dato redondeado (4px) y el extremo de la
 * línea base recto. Recharts aplica el mismo `radius` a todas las barras, así
 * que con valores negativos redondearía el lado equivocado: acá el lado se
 * decide por el signo del valor.
 */
function DivergingBar(props: unknown) {
  const p = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    value?: number;
  };
  const { y, height: h, fill } = p;
  const negative = (p.value ?? 0) < 0;

  // Recharts entrega `width` NEGATIVO cuando el valor lo es (la barra crece
  // hacia la izquierda del cero, y `x` queda sobre la línea del cero).
  // Normalizamos a borde izquierdo + largo; sin esto el radio daba 0 y la
  // barra se dibujaba con ancho cero, o sea invisible.
  const w = Math.abs(p.width);
  const x = p.width < 0 ? p.x + p.width : p.x;

  const r = Math.max(0, Math.min(4, w, h / 2));

  // Barra más corta que el radio: no hay lugar para la curva.
  if (r <= 0 || w <= r) {
    return <rect x={x} y={y} width={w} height={h} fill={fill} />;
  }

  const d = negative
    ? // Redondeado a la izquierda (el dato crece hacia la izquierda del cero).
      `M${x + w},${y} h${-(w - r)} a${r},${r} 0 0 0 ${-r},${r}` +
      ` v${h - 2 * r} a${r},${r} 0 0 0 ${r},${r} h${w - r} z`
    : // Redondeado a la derecha.
      `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r}` +
      ` v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`;

  return <path d={d} fill={fill} />;
}

/** Alto que necesita un gráfico de barras horizontales con `count` filas. */
function barChartHeight(count: number): number {
  return Math.max(200, count * 30 + 40);
}

/**
 * Etiqueta de una barra divergente, siempre hacia la derecha del extremo
 * derecho de la barra.
 *
 * Para una barra positiva ese extremo es la punta; para una negativa es la
 * línea del cero, y el espacio a su derecha está garantizado vacío (esa fila no
 * tiene barra positiva). Así la etiqueta nunca puede encimarse con el nombre de
 * la posición en el eje.
 *
 * Se probaron antes las dos alternativas obvias y ambas fallan: `position`
 * "right" de Recharts deja la etiqueta del negativo sobre el nombre del eje, y
 * sacarla hacia afuera del extremo izquierdo obliga a un margen que hay que
 * recalibrar cada vez que aparece una etiqueta más larga (acá se midieron 30px
 * de solapamiento con los datos reales).
 */
function divergingLabel(props: unknown, format: (n: number) => string) {
  const p = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    value?: number;
  };
  const GAP = 6;

  // Misma normalización que `DivergingBar`: con valores negativos `width` viene
  // negativo, así que `x + width` es el borde izquierdo, no el derecho.
  const right = p.width < 0 ? p.x : p.x + p.width;

  return (
    <text
      x={right + GAP}
      y={p.y + p.height / 2}
      dy={4}
      fill={AXIS}
      fontSize={11}
      textAnchor="start"
    >
      {format(p.value ?? 0)}
    </text>
  );
}

const fmtPctLabel = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtMoneyLabel = (n: number) =>
  `${n >= 0 ? "+" : "−"}${fmtCompact(Math.abs(n))}`;

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
  const [basis, setBasis] = useState<ValuationBasis>("cost");

  const divQuery = useQuery({
    queryKey: ["portfolio-diversification", basis],
    queryFn: () => fetchDiversification(basis),
  });
  const historyQuery = useQuery({
    queryKey: ["portfolio-history"],
    queryFn: fetchHistory,
  });
  // Envueltas en arrow: pasar la función directo haría que TanStack le mande su
  // objeto de contexto como primer argumento.
  const positionsQuery = useQuery({
    queryKey: ["portfolio-positions"],
    queryFn: () => fetchPositions(),
  });
  const dividendsQuery = useQuery({
    queryKey: ["portfolio-dividends"],
    queryFn: () => fetchDividendEvents(),
  });

  const div = divQuery.data;
  const currency = div?.currency ?? "USD";

  const sectorData = useMemo(
    () =>
      (div?.bySector ?? []).map((s) => ({
        label: s.label,
        weight: Number(s.weight),
        costBasis: Number(s.costBasis),
      })),
    [div],
  );

  // Lo que falta para 100% son posiciones sin perfil del proveedor. Se informa
  // en vez de repartirlo, para no inventar una clasificación que no tenemos.
  const sectorUnclassified = useMemo(() => {
    if (sectorData.length === 0) return 0;
    const covered = sectorData.reduce((sum, s) => sum + s.weight, 0);
    return Math.max(0, 100 - covered);
  }, [sectorData]);

  // Rendimiento y contribución solo aplican a posiciones con cotización.
  const performance = useMemo(() => {
    const rows = (positionsQuery.data ?? [])
      .filter((p) => p.returnPct != null)
      .map((p) => ({ label: p.symbol, returnPct: p.returnPct as number }))
      .sort((a, b) => b.returnPct - a.returnPct);
    return rows;
  }, [positionsQuery.data]);

  const contribution = useMemo(() => {
    const rows = (positionsQuery.data ?? [])
      .filter((p) => p.unrealizedPnL != null)
      .map((p) => ({ label: p.symbol, pnl: Number(p.unrealizedPnL) }))
      .sort((a, b) => b.pnl - a.pnl);
    return rows;
  }, [positionsQuery.data]);

  // Posiciones abiertas sin cotización: los dos gráficos de arriba las omiten.
  const missingQuotes = useMemo(() => {
    const data = positionsQuery.data ?? [];
    return data.length - data.filter((p) => p.unrealizedPnL != null).length;
  }, [positionsQuery.data]);

  // Dividendos acumulados por instrumento. Incluye posiciones ya cerradas: lo
  // cobrado es cobrado, aunque hoy no tengas la acción.
  const dividendsByInstrument = useMemo(() => {
    const totals = new Map<string, number>();
    for (const event of dividendsQuery.data ?? []) {
      totals.set(
        event.symbol,
        (totals.get(event.symbol) ?? 0) + Number(event.amount),
      );
    }
    return [...totals.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [dividendsQuery.data]);

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-medium">Diversificación y riesgo</h2>
            <p className="text-[13px] text-muted-foreground">
              {basis === "cost"
                ? "Peso de cada posición sobre el capital invertido (a costo)"
                : "Peso de cada posición sobre el valor de mercado actual"}
            </p>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border p-0.5 text-sm">
            {(
              [
                ["cost", "A costo"],
                ["market", "A mercado"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setBasis(value)}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  basis === value
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {divQuery.isError && (
          <p className="text-negative">No se pudo cargar la diversificación.</p>
        )}

        {div && div.byPosition.length === 0 && basis === "market" && (
          <Card className="py-4">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No hay cotizaciones disponibles para ninguna posición
                {div.excludedForMissingQuote > 0 &&
                  ` (${div.excludedForMissingQuote} excluidas)`}
                . Configurá el proveedor de cotizaciones o volvé a la vista
                &quot;A costo&quot;.
              </p>
            </CardContent>
          </Card>
        )}

        {div && div.byPosition.length > 0 && basis === "market" &&
          div.excludedForMissingQuote > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {div.excludedForMissingQuote} posición(es) excluida(s) por no
              tener cotización disponible.
            </p>
          )}

        {div && div.byPosition.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
              {/* Exposición por país del EMISOR, no por bolsa: hay empresas
                  peruanas listadas en NYSE, y esa exposición no aparece en el
                  sufijo de mercado de XTB. */}
              <ConcentrationTile
                label="Exposición no-US"
                value={
                  div.nonUsWeight == null
                    ? "—"
                    : `${div.nonUsWeight.toFixed(1)}%`
                }
                sub={
                  div.nonUsWeight == null
                    ? "sin datos de país"
                    : div.byCountry
                        .filter((c) => c.label !== "US")
                        .map((c) => c.label)
                        .join(", ") || "todo US"
                }
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

              {/* Por sector — reemplaza al antiguo "Por mercado", que agrupaba
                  por el sufijo de XTB y por eso mostraba siempre una sola
                  categoría (todas las compras son en bolsas de EE.UU.). */}
              <Card className="py-5">
                <CardContent className="flex flex-col gap-3">
                  <span className={KICKER}>Por sector</span>

                  {sectorData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay datos de sector disponibles. Se obtienen del
                      proveedor de cotizaciones la primera vez que se abre esta
                      página.
                    </p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={sectorData}
                            dataKey="weight"
                            nameKey="label"
                            innerRadius="58%"
                            outerRadius="88%"
                            paddingAngle={0}
                            startAngle={90}
                            endAngle={-270}
                            isAnimationActive={false}
                          >
                            {sectorData.map((s, i) => (
                              <Cell
                                key={s.label}
                                fill={sectorColor(i)}
                                // Borde del color de la superficie: es el
                                // separador de 2px entre porciones contiguas.
                                stroke={SURFACE}
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0]?.payload as {
                                label: string;
                                weight: number;
                                costBasis: number;
                              };
                              return (
                                <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
                                  <div className="mb-1 font-medium">
                                    {row.label}
                                  </div>
                                  <div className="tabular-nums text-muted-foreground">
                                    {row.weight.toFixed(1)}% ·{" "}
                                    {formatMoney(row.costBasis, currency)}
                                  </div>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      {/* La leyenda va siempre: el color por sí solo nunca es
                          el único portador de la identidad de la porción. */}
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {sectorData.map((s, i) => (
                          <li
                            key={s.label}
                            className="flex items-center gap-2"
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 flex-none rounded-[3px]"
                              style={{ background: sectorColor(i) }}
                            />
                            <span className="truncate" title={s.label}>
                              {s.label}
                            </span>
                            <span className="ml-auto flex-none tabular-nums text-muted-foreground">
                              {s.weight.toFixed(1)}%
                            </span>
                          </li>
                        ))}
                      </ul>

                      {sectorUnclassified > 0.05 && (
                        <p className="text-[12px] text-muted-foreground">
                          {sectorUnclassified.toFixed(1)}% sin clasificar (el
                          proveedor no reconoce el instrumento).
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* Rendimiento de las posiciones abiertas */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-medium">Rendimiento</h2>
          <p className="text-[13px] text-muted-foreground">
            Posiciones abiertas, sobre el precio de mercado actual
          </p>
        </div>

        {positionsQuery.isError && (
          <p className="text-negative">No se pudieron cargar las posiciones.</p>
        )}

        {performance.length === 0 && contribution.length === 0 ? (
          !positionsQuery.isLoading && (
            <Card className="py-4">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Sin cotizaciones disponibles, no hay rendimiento que mostrar.
                </p>
              </CardContent>
            </Card>
          )
        ) : (
          <>
            {missingQuotes > 0 && (
              <p className="text-[13px] text-muted-foreground">
                {missingQuotes} posición(es) sin cotización quedan fuera de
                estos gráficos.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Rendimiento % — responde "qué está funcionando" */}
              <Card className="py-5">
                <CardContent className="flex flex-col gap-3">
                  <span className={KICKER}>Rendimiento por posición</span>
                  <ResponsiveContainer
                    width="100%"
                    height={barChartHeight(performance.length)}
                  >
                    <BarChart
                      data={performance}
                      layout="vertical"
                      margin={{ top: 4, right: 44, bottom: 4, left: 12 }}
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
                      <ReferenceLine x={0} stroke="rgba(233,233,237,0.25)" />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as {
                            returnPct: number;
                          };
                          return (
                            <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
                              <div className="mb-1 font-medium">{label}</div>
                              <div className="tabular-nums text-muted-foreground">
                                {row.returnPct >= 0 ? "+" : ""}
                                {row.returnPct.toFixed(2)}%
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="returnPct"
                        shape={DivergingBar}
                        maxBarSize={18}
                        isAnimationActive={false}
                      >
                        {performance.map((p) => (
                          <Cell
                            key={p.label}
                            fill={p.returnPct >= 0 ? POSITIVE : NEGATIVE}
                          />
                        ))}
                        <LabelList
                          dataKey="returnPct"
                          content={(props) => divergingLabel(props, fmtPctLabel)}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Contribución en dinero — un +40% sobre una posición chica mueve
                  menos plata que un +8% sobre la más grande. */}
              <Card className="py-5">
                <CardContent className="flex flex-col gap-3">
                  <span className={KICKER}>Contribución al P&amp;L</span>
                  <ResponsiveContainer
                    width="100%"
                    height={barChartHeight(contribution.length)}
                  >
                    <BarChart
                      data={contribution}
                      layout="vertical"
                      margin={{ top: 4, right: 52, bottom: 4, left: 12 }}
                    >
                      <CartesianGrid horizontal={false} stroke={GRID} />
                      <XAxis
                        type="number"
                        tickFormatter={fmtCompact}
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
                      <ReferenceLine x={0} stroke="rgba(233,233,237,0.25)" />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as { pnl: number };
                          return (
                            <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
                              <div className="mb-1 font-medium">{label}</div>
                              <div className="tabular-nums text-muted-foreground">
                                {row.pnl >= 0 ? "+" : "−"}
                                {formatMoney(Math.abs(row.pnl), currency)}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="pnl"
                        shape={DivergingBar}
                        maxBarSize={18}
                        isAnimationActive={false}
                      >
                        {contribution.map((c) => (
                          <Cell
                            key={c.label}
                            fill={c.pnl >= 0 ? POSITIVE : NEGATIVE}
                          />
                        ))}
                        <LabelList
                          dataKey="pnl"
                          content={(props) => divergingLabel(props, fmtMoneyLabel)}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* Dividendos por instrumento */}
      {dividendsByInstrument.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-medium">Dividendos</h2>
            <p className="text-[13px] text-muted-foreground">
              Total cobrado por instrumento — incluye posiciones ya cerradas
            </p>
          </div>

          <Card className="py-5">
            <CardContent className="flex flex-col gap-3">
              <span className={KICKER}>Cobrado por instrumento</span>
              <ResponsiveContainer
                width="100%"
                height={barChartHeight(dividendsByInstrument.length)}
              >
                <BarChart
                  data={dividendsByInstrument}
                  layout="vertical"
                  margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis
                    type="number"
                    tickFormatter={fmtCompact}
                    tick={{ fill: AXIS, fontSize: 12 }}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={84}
                    tick={{ fill: AXIS, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as { amount: number };
                      return (
                        <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
                          <div className="mb-1 font-medium">{label}</div>
                          <div className="tabular-nums text-muted-foreground">
                            {formatMoney(row.amount, currency)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill={SERIES_DIVIDENDS}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="amount"
                      position="right"
                      formatter={(v) =>
                        v == null ? "" : formatMoney(Number(v), currency)
                      }
                      fill={AXIS}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>
      )}

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
