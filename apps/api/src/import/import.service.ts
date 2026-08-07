import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  parseXtbWorkbook,
  ParseError,
  type ParsedOperation,
} from './xtb-parser';

/** Resultado de una importación ya aplicada. */
export interface ImportSummary {
  operationsBefore: number;
  operationsAfter: number;
  /** Operaciones del archivo que no estaban en la base. */
  added: number;
  /** Operaciones que estaban en la base y no vienen en el archivo. */
  removed: number;
  /** Operaciones presentes en ambos. */
  kept: number;
  duplicatesInFile: number;
  errors: ParseError[];
}

/** Lo que pasaría al importar, sin escribir nada. */
export interface ImportPreview {
  operationsInFile: number;
  operationsInDb: number;
  added: number;
  removed: number;
  kept: number;
  duplicatesInFile: number;
  errors: ParseError[];
  /**
   * El archivo elimina más de la mitad de lo que hay. No bloquea, pero la
   * interfaz lo destaca: es el síntoma de haber elegido el archivo equivocado.
   */
  warnsLargeDeletion: boolean;
}

export interface LastImportRun {
  fileName: string;
  importedAt: string;
  operationsBefore: number;
  operationsAfter: number;
  status: 'OK' | 'FAILED';
  errorCount: number;
}

// Por encima de esta fracción de borrado, la vista previa avisa.
const LARGE_DELETION_RATIO = 0.5;

/**
 * Importación de archivos de XTB.
 *
 * **Semántica: reemplazo total** (Fase 4.5). El export de XTB es acumulativo —
 * trae el historial completo — así que el archivo subido *es* la verdad: se
 * borran todas las operaciones y se reinsertan desde el archivo. Es la única
 * forma de que una operación corregida o eliminada en XTB se refleje acá; la
 * importación aditiva anterior las ignoraba en silencio.
 *
 * Lo que **nunca** se borra es `Instrument`: ahí viven `externalTicker` (que se
 * corrige a mano) y el perfil de sector/país de la Fase 3.6. Un instrumento que
 * se queda sin operaciones simplemente queda huérfano, lo que no molesta a nadie
 * y conserva ese trabajo por si la operación reaparece en un export futuro.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deduplica por `externalId` conservando la primera aparición.
   *
   * El `externalId` se deriva del contenido (`xtb-pos-{positionId}-{volumen}`),
   * así que dos filas del mismo `positionId` con idéntico volumen colisionan.
   * Con la importación aditiva anterior la segunda se saltaba sin ruido; con
   * `createMany` violaría la clave única y abortaría la importación entera, así
   * que hay que resolverlo antes de escribir.
   *
   * Con el archivo real de referencia esto no ocurre (182 operaciones, 182 ids
   * únicos), pero el modo de fallo es lo bastante malo como para blindarlo.
   */
  private dedupe(operations: ParsedOperation[]): {
    unique: ParsedOperation[];
    duplicates: number;
  } {
    const byId = new Map<string, ParsedOperation>();
    let duplicates = 0;
    for (const op of operations) {
      if (byId.has(op.externalId)) {
        duplicates++;
        continue;
      }
      byId.set(op.externalId, op);
    }
    return { unique: [...byId.values()], duplicates };
  }

  /**
   * Parsea y valida. Un archivo del que no sale ninguna operación se rechaza
   * **antes** de tocar la base: es el síntoma de haber subido el archivo
   * equivocado, y sin esta guarda el reemplazo dejaría el portafolio vacío.
   */
  private parseOrThrow(buffer: Buffer) {
    let parsed: ReturnType<typeof parseXtbWorkbook>;
    try {
      parsed = parseXtbWorkbook(buffer);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Error al procesar el archivo.',
      );
    }

    const { unique, duplicates } = this.dedupe(parsed.operations);
    if (unique.length === 0) {
      throw new BadRequestException(
        'El archivo no contiene ninguna operación válida. No se modificó nada. ' +
          'Verificá que sea el export de XTB correcto.',
      );
    }
    return { unique, duplicates, errors: parsed.errors };
  }

  /** Compara el archivo contra la base sin escribir nada. */
  async previewImport(buffer: Buffer): Promise<ImportPreview> {
    const { unique, duplicates, errors } = this.parseOrThrow(buffer);

    const existing = await this.prisma.operation.findMany({
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((o) => o.externalId));
    const fileIds = new Set(unique.map((o) => o.externalId));

    const kept = [...fileIds].filter((id) => existingIds.has(id)).length;
    const added = fileIds.size - kept;
    const removed = existingIds.size - kept;

    return {
      operationsInFile: unique.length,
      operationsInDb: existingIds.size,
      added,
      removed,
      kept,
      duplicatesInFile: duplicates,
      errors,
      warnsLargeDeletion:
        existingIds.size > 0 && removed / existingIds.size > LARGE_DELETION_RATIO,
    };
  }

  /**
   * Reemplaza todas las operaciones por las del archivo, en una transacción.
   *
   * Si algo falla, el rollback deja la base exactamente como estaba y se
   * registra un `ImportRun` con estado `FAILED` **fuera** de la transacción —
   * dentro se revertiría junto con todo lo demás y no quedaría rastro.
   */
  async importXtbFile(
    buffer: Buffer,
    fileName: string,
  ): Promise<ImportSummary> {
    const { unique, duplicates, errors } = this.parseOrThrow(buffer);

    const before = await this.prisma.operation.count();
    const existing = await this.prisma.operation.findMany({
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((o) => o.externalId));
    const kept = unique.filter((o) => existingIds.has(o.externalId)).length;

    try {
      const after = await this.prisma.$transaction(async (tx) => {
        await tx.operation.deleteMany({});

        // Los instrumentos se resuelven dentro de la transacción para que un
        // fallo tampoco deje instrumentos a medio crear.
        const instrumentIds = new Map<string, string>();
        for (const op of unique) {
          if (instrumentIds.has(op.symbol)) continue;
          const market = op.symbol.includes('.')
            ? op.symbol.split('.').pop()!
            : null;
          const instrument = await tx.instrument.upsert({
            where: { symbol: op.symbol },
            // `update: {}` a propósito: nunca se pisan datos de un instrumento
            // ya conocido. Es lo que hace que `externalTicker` y el perfil de
            // sector sobrevivan a las reimportaciones.
            update: {},
            create: {
              symbol: op.symbol,
              name: op.symbol,
              type: 'STOCK',
              market,
              currency: op.currency,
            },
          });
          instrumentIds.set(op.symbol, instrument.id);
        }

        await tx.operation.createMany({
          data: unique.map((op) => ({
            externalId: op.externalId,
            type: op.type,
            date: op.date,
            quantity: op.quantity,
            price: op.price,
            commission: op.commission,
            currency: op.currency,
            instrumentId: instrumentIds.get(op.symbol)!,
          })),
        });

        return tx.operation.count();
      });

      await this.recordRun(fileName, before, after, errors, 'OK');

      this.logger.log(
        `Importación de "${fileName}": ${before} -> ${after} operaciones.`,
      );

      return {
        operationsBefore: before,
        operationsAfter: after,
        added: unique.length - kept,
        removed: existingIds.size - kept,
        kept,
        duplicatesInFile: duplicates,
        errors,
      };
    } catch (err) {
      // La transacción revirtió: el conteo posterior es el mismo que el previo.
      await this.recordRun(fileName, before, before, errors, 'FAILED');
      const message =
        err instanceof Error ? err.message : 'Error desconocido al importar.';
      this.logger.error(`Importación de "${fileName}" falló: ${message}`);
      throw new BadRequestException(
        `No se importó nada, la base quedó sin cambios. Detalle: ${message}`,
      );
    }
  }

  private async recordRun(
    fileName: string,
    before: number,
    after: number,
    errors: ParseError[],
    status: 'OK' | 'FAILED',
  ): Promise<void> {
    await this.prisma.importRun.create({
      data: {
        fileName,
        operationsBefore: before,
        operationsAfter: after,
        errors: errors as unknown as Prisma.InputJsonValue,
        status,
      },
    });
  }

  /** Última importación registrada, o null si nunca se importó. */
  async getLastRun(): Promise<LastImportRun | null> {
    const run = await this.prisma.importRun.findFirst({
      orderBy: { importedAt: 'desc' },
    });
    if (!run) return null;

    const errors = Array.isArray(run.errors) ? run.errors : [];
    return {
      fileName: run.fileName,
      importedAt: run.importedAt.toISOString(),
      operationsBefore: run.operationsBefore,
      operationsAfter: run.operationsAfter,
      status: run.status,
      errorCount: errors.length,
    };
  }
}
