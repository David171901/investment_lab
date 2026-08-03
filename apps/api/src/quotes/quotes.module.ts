import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { TwelveDataProvider } from './twelve-data.provider';
import { FinnhubProvider } from './finnhub.provider';

@Module({
  providers: [QuotesService, FinnhubProvider, TwelveDataProvider],
  exports: [QuotesService],
})
export class QuotesModule {}
