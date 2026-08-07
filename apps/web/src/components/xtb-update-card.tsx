"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchLastImportRun,
  importXtbFile,
  previewXtbImport,
  type ImportPreview,
  type ImportSummary,
} from "@/lib/api";

const KICKER =
  "text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

function DeltaRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "muted";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Actualización de los datos de XTB, en dos pasos: primero se consulta qué
 * cambiaría y recién con la confirmación se escribe.
 *
 * El paso de vista previa existe porque la importación **reemplaza** todas las
 * operaciones, y no hay respaldo: ver los números antes de confirmar es la
 * única red contra subir el archivo equivocado.
 */
export function XtbUpdateCard({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  const lastRunQuery = useQuery({
    queryKey: ["import-last-run"],
    queryFn: fetchLastImportRun,
  });

  function reset() {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handlePreview() {
    const selected = fileInputRef.current?.files?.[0];
    if (!selected) return;
    setBusy("preview");
    setError(null);
    setSummary(null);
    try {
      setPreview(await previewXtbImport(selected));
      setFile(selected);
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof Error ? err.message : "Error al leer el archivo.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importXtbFile(file);
      setSummary(result);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Un reemplazo de operaciones afecta a TODAS las vistas derivadas
      // (posiciones, resumen, diversificación, histórico, dividendos, detalle).
      // Se invalida todo en vez de enumerar claves: la lista se desactualizaría
      // en cuanto se agregue una consulta nueva.
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setBusy(null);
    }
  }

  const lastRun = lastRunQuery.data;

  return (
    <Card className={cn("py-5", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={KICKER}>Datos de XTB</span>
            <span className="text-[13px] text-muted-foreground">
              {lastRun
                ? `Última actualización ${relativeTime(lastRun.importedAt)} · ${lastRun.operationsAfter} operaciones`
                : "Todavía no importaste ningún archivo"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={() => {
              setPreview(null);
              setSummary(null);
              setError(null);
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={busy !== null}
          >
            {busy === "preview" ? "Leyendo..." : "Revisar cambios"}
          </Button>
        </div>

        {error && <p className="text-sm text-negative">{error}</p>}

        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-white/[0.02] p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">
                El archivo reemplaza todo el historial:
              </span>
              <span className="tabular-nums font-medium">
                {preview.operationsInDb} → {preview.operationsInFile}
              </span>
              <span className="text-sm text-muted-foreground">operaciones</span>
            </div>

            <div className="flex flex-col gap-1">
              <DeltaRow
                label="Se agregan"
                value={preview.added}
                tone="positive"
              />
              <DeltaRow
                label="Se eliminan"
                value={preview.removed}
                tone={preview.removed > 0 ? "negative" : "muted"}
              />
              <DeltaRow label="Sin cambios" value={preview.kept} tone="muted" />
              {preview.duplicatesInFile > 0 && (
                <DeltaRow
                  label="Duplicadas en el archivo (se descartan)"
                  value={preview.duplicatesInFile}
                  tone="muted"
                />
              )}
            </div>

            {preview.warnsLargeDeletion && (
              <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-[13px] text-negative">
                Este archivo elimina más de la mitad de tus operaciones.
                Verificá que sea el export correcto — no hay forma de deshacer.
              </p>
            )}

            {preview.errors.length > 0 && (
              <details className="text-[13px]">
                <summary className="cursor-pointer text-muted-foreground">
                  {preview.errors.length} fila(s) con errores de lectura
                </summary>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {preview.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      {e.sheet} (fila {e.row}): {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={busy !== null}
              >
                {busy === "import"
                  ? "Actualizando..."
                  : "Confirmar y reemplazar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={busy !== null}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <div className="rounded-lg border border-border bg-white/[0.02] p-4 text-sm">
            <p>
              Listo:{" "}
              <span className="tabular-nums">
                {summary.operationsBefore} → {summary.operationsAfter}
              </span>{" "}
              operaciones ({summary.added} agregadas, {summary.removed}{" "}
              eliminadas).
            </p>
            {summary.errors.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {summary.errors.length} fila(s) no se pudieron leer.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
