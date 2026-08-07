import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinnhubProvider } from './finnhub.provider';
import { QuotesService } from './quotes.service';
import { RateLimitError } from './provider-types';
import { sectorForIndustry } from './sectors';

// El sector y el país de una empresa no cambian en años. Un mes es un TTL
// conservador que además hace que un ticker recién corregido en
// `externalTicker` no espere para siempre a que lo reintenten.
const PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ProfileDto {
  /** Nombre comercial. Null si el proveedor no lo conoce. */
  name: string | null;
  industry: string | null;
  sector: string;
  country: string | null;
  logoUrl: string | null;
}

interface InstrumentRef {
  instrumentId: string;
  symbol: string;
  externalTicker: string | null;
}

/**
 * Perfil (sector y país) de cada instrumento, con cache en Postgres (Fase 3.6).
 *
 * Sigue el mismo criterio de resiliencia que `QuotesService`: una falla del
 * proveedor nunca se propaga. Si no hay clave, o la API falla, o el símbolo no
 * existe allá, el instrumento queda sin sector y la UI lo agrupa aparte en vez
 * de romperse.
 *
 * A diferencia de los precios, esto se pide **una sola vez por instrumento**,
 * así que su impacto en la cuota diaria es despreciable.
 */
@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  // Consultas en curso. La página de análisis pide diversificación por sector y
  // por país en el mismo render; sin esto serían dos tandas idénticas.
  private inFlight: Promise<Map<string, ProfileDto>> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FinnhubProvider,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  /** Perfiles indexados por `instrumentId`. Sin clave configurada: mapa vacío. */
  async getProfiles(
    instruments: InstrumentRef[],
  ): Promise<Map<string, ProfileDto>> {
    if (instruments.length === 0 || !this.provider.isConfigured()) {
      return new Map();
    }
    if (this.inFlight) return this.inFlight;

    const promise = this.loadProfiles(instruments).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }

  private async loadProfiles(
    instruments: InstrumentRef[],
  ): Promise<Map<string, ProfileDto>> {
    const ids = instruments.map((i) => i.instrumentId);
    const rows = await this.prisma.instrument.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        symbol: true,
        industry: true,
        sector: true,
        country: true,
        logoUrl: true,
        profileFetchedAt: true,
      },
    });
    const cached = new Map(rows.map((r) => [r.id, r]));

    const result = new Map<string, ProfileDto>();
    const cutoff = new Date(Date.now() - PROFILE_TTL_MS);
    const stale: InstrumentRef[] = [];

    for (const instrument of instruments) {
      const hit = cached.get(instrument.instrumentId);
      // `profileFetchedAt` seteado es la marca de "ya preguntamos": vale aunque
      // el proveedor no haya devuelto nada, para no reintentar en cada carga.
      const fresh = hit?.profileFetchedAt && hit.profileFetchedAt > cutoff;
      if (fresh) {
        if (hit.sector || hit.country || hit.logoUrl) {
          result.set(instrument.instrumentId, {
            // `name` arranca igual al symbol (el import no tiene el nombre de
            // la empresa); si sigue así, es un placeholder, no un nombre real.
            name: hit.name && hit.name !== hit.symbol ? hit.name : null,
            industry: hit.industry,
            sector: hit.sector ?? sectorForIndustry(null),
            country: hit.country,
            logoUrl: hit.logoUrl,
          });
        }
        continue;
      }
      stale.push(instrument);
    }

    if (stale.length === 0) return result;

    try {
      const tickers = stale.map((i) => QuotesService.tickerFor(i));
      const fetched = await this.provider.fetchProfiles(tickers);
      const byTicker = new Map(fetched.map((p) => [p.ticker, p]));

      for (const instrument of stale) {
        const ticker = QuotesService.tickerFor(instrument);
        const profile = byTicker.get(ticker);
        const sector = profile ? sectorForIndustry(profile.industry) : null;

        await this.prisma.instrument.update({
          where: { id: instrument.instrumentId },
          data: {
            // El import deja `name` igual al symbol porque el export de XTB no
            // trae el nombre de la empresa; acá se completa con el del
            // proveedor. Solo se pisa si hay uno real, para no degradar el
            // dato cuando el proveedor no conoce el instrumento.
            ...(profile?.name ? { name: profile.name } : {}),
            industry: profile?.industry ?? null,
            sector,
            country: profile?.country ?? null,
            logoUrl: profile?.logoUrl ?? null,
            profileFetchedAt: new Date(),
          },
        });

        if (profile) {
          result.set(instrument.instrumentId, {
            name: profile.name,
            industry: profile.industry,
            sector: sector ?? sectorForIndustry(null),
            country: profile.country,
            logoUrl: profile.logoUrl,
          });
        }
      }
    } catch (err) {
      // Igual que con los precios: sin perfil se sigue funcionando. No se
      // marca `profileFetchedAt`, así que se reintenta en la próxima carga.
      const reason =
        err instanceof RateLimitError
          ? 'límite de uso alcanzado'
          : err instanceof Error
            ? err.message
            : 'error desconocido';
      this.logger.warn(`No se pudieron obtener perfiles: ${reason}.`);
    }

    return result;
  }
}
