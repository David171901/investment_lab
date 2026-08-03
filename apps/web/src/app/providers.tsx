"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Debe acompañar al TTL de cotizaciones del backend (`CACHE_TTL_MS`): este es
// el caché de afuera, así que si fuera mayor el backend nunca llegaría a
// refrescar. Con los defaults de TanStack Query (staleTime 0 + refetch al
// enfocar la ventana) cada navegación y cada vuelta a la pestaña dispararía un
// refetch completo, que aguas abajo consume cuota del proveedor de precios.
// Para el precio del momento existe el botón "Actualizar precios".
const STALE_TIME_MS = 5 * 60 * 1000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME_MS,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
