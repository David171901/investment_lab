import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ImportModule } from './import/import.module';
import { AnalysisModule } from './analysis/analysis.module';
import { AiModule } from './ai/ai.module';
import { QuotesModule } from './quotes/quotes.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PortfolioModule,
    ImportModule,
    AnalysisModule,
    AiModule,
    QuotesModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
