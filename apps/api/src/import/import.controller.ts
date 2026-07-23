import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('xtb')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importXtb(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo. Usá el campo "file".');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Solo se admiten archivos .xlsx exportados desde XTB.');
    }

    try {
      return await this.importService.importXtbFile(file.buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Error al procesar el archivo.');
    }
  }
}
