import { Controller, Get } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('positions')
  getPositions() {
    return this.portfolioService.getPositions();
  }

  @Get('summary')
  getSummary() {
    return this.portfolioService.getSummary();
  }
}
