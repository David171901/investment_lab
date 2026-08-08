import { Controller, Get, Param, Query } from '@nestjs/common';
import { PortfolioService, type ValuationBasis } from './portfolio.service';

// Rango del gráfico de velas. Se pide siempre el máximo y el frontend recorta,
// así cambiar de 3M a 1A no gasta otra llamada al proveedor.
const CANDLE_DAYS = 365;

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // `?refresh=true` ignora el cache de cotizaciones y consulta al proveedor.
  @Get('positions')
  getPositions(@Query('refresh') refresh?: string) {
    return this.portfolioService.getPositions(refresh === 'true');
  }

  @Get('summary')
  getSummary(@Query('refresh') refresh?: string) {
    return this.portfolioService.getSummary(refresh === 'true');
  }

  @Get('realized')
  getRealized() {
    return this.portfolioService.getRealizedEvents();
  }

  @Get('dividends')
  getDividends() {
    return this.portfolioService.getDividendEvents();
  }

  // "Empresas que poseías": posiciones cerradas, una fila por ciclo compra-venta.
  @Get('closed-positions')
  getClosedPositions() {
    return this.portfolioService.getClosedPositions();
  }

  @Get('diversification')
  getDiversification(@Query('basis') basis?: string) {
    const valuation: ValuationBasis = basis === 'market' ? 'market' : 'cost';
    return this.portfolioService.getDiversification(valuation);
  }

  @Get('history')
  getHistory() {
    return this.portfolioService.getHistory();
  }

  // Detalle de un instrumento: su posición + velas históricas (Fase 3.5).
  @Get('instrument/:symbol')
  getInstrument(@Param('symbol') symbol: string) {
    return this.portfolioService.getInstrumentDetail(symbol, CANDLE_DAYS);
  }
}
