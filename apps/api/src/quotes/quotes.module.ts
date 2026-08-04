import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { ProfilesService } from './profiles.service';
import { TwelveDataProvider } from './twelve-data.provider';
import { FinnhubProvider } from './finnhub.provider';

@Module({
  providers: [
    QuotesService,
    ProfilesService,
    FinnhubProvider,
    TwelveDataProvider,
  ],
  exports: [QuotesService, ProfilesService],
})
export class QuotesModule {}
