import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * **Reemplaza** todas las operaciones por las del archivo (Fase 4.5).
   *
   * Cambio incompatible respecto de la Fase 1, donde este mismo endpoint solo
   * agregaba lo que faltaba. Se mantuvo la URL en vez de crear una nueva para
   * no dejar dos caminos con nombres parecidos haciendo cosas distintas.
   */
  @Post('xtb')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async importXtb(@UploadedFile() file?: Express.Multer.File) {
    const validated = this.validate(file);
    return this.importService.importXtbFile(
      validated.buffer,
      validated.originalname,
    );
  }

  /** Qué pasaría al importar este archivo. No escribe nada. */
  @Post('xtb/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async previewXtb(@UploadedFile() file?: Express.Multer.File) {
    const validated = this.validate(file);
    return this.importService.previewImport(validated.buffer);
  }

  /** Última importación registrada. `null` si nunca se importó. */
  @Get('last-run')
  async lastRun() {
    return this.importService.getLastRun();
  }

  private validate(file?: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo. Usá el campo "file".',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException(
        'Solo se admiten archivos .xlsx exportados desde XTB.',
      );
    }
    return file;
  }
}
