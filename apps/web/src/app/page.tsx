import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Investment Lab</h1>
      <p className="text-muted-foreground">Fase 1 — importación de operaciones.</p>
      <Link href="/operaciones">
        <Button>Ver operaciones</Button>
      </Link>
    </div>
  );
}
