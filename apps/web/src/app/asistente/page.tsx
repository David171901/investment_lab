"use client";

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { streamAnalysisAnswer } from "@/lib/api";

const EXAMPLE_QUESTIONS = [
  "¿Estoy muy concentrado en pocas posiciones?",
  "¿Cómo viene mi rendimiento realizado hasta ahora?",
  "¿Qué riesgos ves en mi portafolio actual?",
];

export default function AsistentePage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuestion(trimmed);
    setAnswer("");
    setError(null);
    setIsStreaming(true);

    try {
      await streamAnalysisAnswer(
        trimmed,
        (chunk) => setAnswer((prev) => prev + chunk),
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] min-h-screen flex-col gap-8 px-6 py-8">
      <nav className="flex flex-col gap-0.5">
        <span className="text-lg font-medium">Asistente</span>
        <span className="text-[13px] text-muted-foreground">
          Preguntale a Claude sobre tu portafolio — respuestas basadas en tus
          datos reales
        </span>
      </nav>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Escribí tu pregunta sobre el portafolio..."
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isStreaming || !question.trim()}>
            {isStreaming ? "Generando..." : "Preguntar"}
          </Button>
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              disabled={isStreaming}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-[var(--accent)] hover:text-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="text-negative">{error}</p>}

      {(answer || isStreaming) && (
        <Card className="py-5">
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {answer}
              {isStreaming && <span className="animate-pulse">▍</span>}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
