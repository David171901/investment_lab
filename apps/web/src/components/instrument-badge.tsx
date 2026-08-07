"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Identidad visual de un instrumento: logo, símbolo y nombre de la empresa.
 *
 * Los tres datos degradan de forma independiente:
 * - Sin `logoUrl` (o si la imagen falla al cargar) se muestran las iniciales
 *   del símbolo sobre un fondo neutro, para que la fila no cambie de alto.
 * - Sin nombre real, `name` viene igual al `symbol` porque el export de XTB no
 *   lo trae; en ese caso no se repite el texto dos veces.
 */
export function InstrumentBadge({
  symbol,
  name,
  logoUrl,
  size = "md",
  className,
}: {
  symbol: string;
  name?: string | null;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const box = { sm: "size-6", md: "size-8", lg: "size-11" }[size];
  const symbolText = { sm: "text-[13px]", md: "text-sm", lg: "text-lg" }[size];
  const nameText = { sm: "text-[11px]", md: "text-[12px]", lg: "text-[13px]" }[
    size
  ];

  // El nombre solo aporta si es distinto del símbolo.
  const companyName = name && name !== symbol ? name : null;
  const showImage = Boolean(logoUrl) && !imageFailed;

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <div
        className={cn(
          box,
          "flex flex-none items-center justify-center overflow-hidden rounded-md bg-white/[0.06]",
        )}
      >
        {showImage ? (
          // <img> nativo a propósito: next/image exigiría declarar el dominio
          // del proveedor en la config, y acá no aporta nada (son PNG de ~5 KB).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl as string}
            alt=""
            loading="lazy"
            className="size-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground">
            {symbol.split(".")[0].slice(0, 3)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn(symbolText, "font-medium")}>{symbol}</span>
        {companyName && (
          <span
            className={cn(nameText, "truncate text-muted-foreground")}
            title={companyName}
          >
            {companyName}
          </span>
        )}
      </div>
    </div>
  );
}
