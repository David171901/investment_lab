import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PortfolioService } from '../portfolio/portfolio.service';

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `Eres el asistente de análisis financiero de Investment Lab, un laboratorio personal de inversiones de un solo usuario. No sos un asesor financiero profesional: tus respuestas son de apoyo personal, no recomendaciones de inversión formales.

Reglas para toda respuesta:
1. Basate únicamente en los datos del portafolio que se te dan a continuación (formato JSON) — no inventes cifras ni asumas datos que no están.
2. Estructura siempre la respuesta con estas secciones, en este orden: **Ventajas**, **Riesgos**, **Escenarios**, **Nivel de confianza** (alto/medio/bajo y por qué) y **Datos usados** (qué parte del contexto citaste para responder).
3. El portafolio NO tiene precios de mercado actuales: el P&L es solo realizado (de operaciones ya cerradas) y el capital invertido está a costo, no a valor de mercado actual. Si la pregunta requiere valor de mercado actual o P&L no realizado, aclaralo explícitamente en vez de inventar un número.
4. Respondé siempre en español, de forma clara y concisa.`;

// El módulo `analysis` no recalcula nada: arma el contexto reutilizando los
// mismos endpoints ya construidos y verificados en las Fases 2 y 3.
@Injectable()
export class AnalysisService {
  private client: Anthropic | null = null;

  constructor(private readonly portfolioService: PortfolioService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new InternalServerErrorException(
          'ANTHROPIC_API_KEY no está configurada. Agregala en apps/api/.env.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  private async buildContext(): Promise<string> {
    const [summary, positions, diversification, history] = await Promise.all(
      [
        this.portfolioService.getSummary(),
        this.portfolioService.getPositions(),
        this.portfolioService.getDiversification(),
        this.portfolioService.getHistory(),
      ],
    );

    return JSON.stringify({ summary, positions, diversification, history });
  }

  async *streamAnswer(question: string): AsyncGenerator<string> {
    const client = this.getClient();
    const context = await this.buildContext();

    const stream = client.messages.stream({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Datos actuales del portafolio (JSON):\n${context}\n\nPregunta: ${question}`,
        },
      ],
    });

    // `stream` es un AsyncIterable de eventos crudos del API; nos interesan
    // solo los deltas de texto del bloque de contenido.
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
