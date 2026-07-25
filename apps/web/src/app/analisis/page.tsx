import { PortfolioAnalysis } from "@/components/portfolio-analysis";

export default function AnalisisPage() {
  return (
    <div className="mx-auto flex w-full min-h-screen max-w-[1180px] flex-col gap-12 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Análisis</span>
        <span className="text-[13px] text-muted-foreground">
          Diversificación, riesgo y evolución del portafolio
        </span>
      </nav>

      <PortfolioAnalysis />
    </div>
  );
}
