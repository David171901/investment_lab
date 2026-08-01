import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AnalysisService } from './analysis.service';

interface AskDto {
  question: string;
}

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  // Respuesta en streaming: el cuerpo es texto plano que Claude va generando
  // (no SSE) — el frontend lo lee incrementalmente con fetch + ReadableStream.
  @Post('ask')
  async ask(@Body() body: AskDto, @Res() res: Response): Promise<void> {
    const question = body?.question?.trim();
    if (!question) {
      res.status(400).json({ message: 'La pregunta no puede estar vacía.' });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    try {
      for await (const chunk of this.analysisService.streamAnswer(question)) {
        res.write(chunk);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error generando el análisis.';
      if (!res.headersSent) {
        res.status(500);
      }
      res.write(`\n\n[Error: ${message}]`);
    } finally {
      res.end();
    }
  }
}
