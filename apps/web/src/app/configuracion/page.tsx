import { XtbUpdateCard } from "@/components/xtb-update-card";

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto flex w-full min-h-screen max-w-[1180px] flex-col gap-8 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Configuración</span>
        <span className="text-[13px] text-muted-foreground">
          Origen de datos y mantenimiento del portafolio
        </span>
      </nav>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-medium">Importar datos de XTB</h2>
          <p className="text-[13px] text-muted-foreground">
            Subí el export más reciente de tu cuenta. El archivo{" "}
            <strong className="font-medium text-foreground">reemplaza</strong>{" "}
            todo el historial, así que primero vas a ver qué cambia.
          </p>
        </div>

        <XtbUpdateCard />

        <p className="text-[12px] text-muted-foreground">
          Se admite el formato vigente de XTB (hojas{" "}
          <code className="rounded bg-white/[0.06] px-1">Closed Positions</code>
          , <code className="rounded bg-white/[0.06] px-1">Open Positions</code>{" "}
          y{" "}
          <code className="rounded bg-white/[0.06] px-1">Cash Operations</code>
          ). Los exports anteriores a agosto de 2026 se rechazan.
        </p>
      </section>
    </div>
  );
}
