"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { Candle } from "@/lib/api";

// Par alcista/bajista validado con el script de la skill dataviz contra la
// superficie de la card (#232532): ΔE 9.4 en deuteranopía, por encima del
// umbral de 8, así que el color solo ya distingue las velas.
const UP = "#199e70";
const DOWN = "#d95926";
const AXIS = "#8b8ea0";
const GRID = "rgba(233,233,237,0.08)";

const RANGES = [
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
] as const;

interface CandleDatum extends Candle {
  // [low, high] — Recharts dibuja la barra sobre este rango y la forma
  // personalizada usa esa geometría para ubicar mecha y cuerpo.
  range: [number, number];
}

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleDatum;
}

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const span = high - low;

  // Conversión de precio a píxel dentro de la barra [low, high].
  const priceToY = (price: number) =>
    span === 0 ? y + height / 2 : y + ((high - price) / span) * height;

  const bodyTop = priceToY(Math.max(open, close));
  const bodyBottom = priceToY(Math.min(open, close));
  // Mínimo de 1px para que un día sin variación (doji) siga siendo visible.
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  const color = close >= open ? UP : DOWN;
  const centerX = x + width / 2;
  const bodyWidth = Math.max(1, width);

  return (
    <g>
      <line
        x1={centerX}
        x2={centerX}
        y1={y}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={centerX - bodyWidth / 2}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
      />
    </g>
  );
}

function CandleTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload?: CandleDatum }[];
  currency: string;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);

  const rows: [string, number][] = [
    ["Apertura", datum.open],
    ["Máximo", datum.high],
    ["Mínimo", datum.low],
    ["Cierre", datum.close],
  ];

  return (
    <div className="rounded-md bg-card px-3 py-2 text-xs shadow-lg ring-1 ring-white/10">
      <div className="mb-1 font-medium">{datum.date}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center gap-4">
          <span className="text-muted-foreground">{label}</span>
          <span className="ml-auto tabular-nums">{fmt(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CandlestickChart({
  candles,
  currency,
}: {
  candles: Candle[];
  currency: string;
}) {
  const [days, setDays] = useState<number>(180);

  // El backend trae 1 año de una sola vez; recortar acá evita una llamada
  // nueva al proveedor cada vez que se cambia el rango.
  const data = useMemo<CandleDatum[]>(() => {
    const sliced = candles.slice(-days);
    return sliced.map((c) => ({ ...c, range: [c.low, c.high] }));
  }, [candles, days]);

  const domain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    const lows = Math.min(...data.map((d) => d.low));
    const highs = Math.max(...data.map((d) => d.high));
    const pad = (highs - lows) * 0.05 || 1;
    return [lows - pad, highs + pad];
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Precio histórico (velas diarias)
        </span>
        <div className="inline-flex items-center rounded-lg border border-border p-0.5 text-sm">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-md px-3 py-1 transition-colors",
                days === r.days
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          barCategoryGap="20%"
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="date"
            tick={{ fill: AXIS, fontSize: 12 }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={domain}
            tick={{ fill: AXIS, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(props) => (
              <CandleTooltip
                active={props.active}
                payload={
                  props.payload as unknown as { payload?: CandleDatum }[]
                }
                currency={currency}
              />
            )}
          />
          <Bar
            dataKey="range"
            shape={<CandleShape />}
            isAnimationActive={false}
            maxBarSize={12}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
