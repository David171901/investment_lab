import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { OperationsController } from './operations.controller';
import { ImportService } from './import.service';

@Module({
  controllers: [ImportController, OperationsController],
  providers: [ImportService],
})
export class ImportModule {}
