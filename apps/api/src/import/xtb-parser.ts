import * as XLSX from 'xlsx';

export type ParsedOperationType = 'BUY' | 'SELL' | 'DIVIDEND';

export interface ParsedOperation {
  externalId: string;
  type: ParsedOperationType;
  symbol: string;
  date: Date;
  quantity: number;
  price: number;
  commission: number;
  currency: string;
}

export interface ParseError {
  sheet: string;
  row: number;
  message: string;
}

export interface ParseResult {
  operations: ParsedOperation[];
  errors: ParseError[];
}

type SheetRow = unknown[];

const CLOSED_POSITIONS_SHEET = 'Closed Positions';
const OPEN_POSITIONS_SHEET = 'Open Positions';
const CASH_OPERATIONS_SHEET = 'Cash Operations';

// La columna que identifica la posición se llama distinto en cada hoja.
const CLOSED_POSITION_ID_COLUMN = 'Position ID';
const OPEN_POSITION_ID_COLUMN = 'Instrument/Position';

// El tipo con el que XTB marca los dividendos en la hoja de caja. En el formato
// anterior venía con un typo del propio broker ("DIVIDENT"), ya corregido.
const DIVIDEND_TYPE = 'dividend';

/**
 * Parser del export .xlsx de XTB.
 *
 * Escrito para el formato vigente desde agosto de 2026 (hojas `Closed
 * Positions`, `Open Positions` y `Cash Operations`). El formato anterior
 * —hojas en mayúsculas con sufijo de fecha, fechas `dd/mm/yyyy`— **ya no se
 * admite**: fue una decisión explícita para no arrastrar dos gramáticas, dado
 * que el export nuevo trae el historial completo.
 */
export function parseXtbWorkbook(buffer: Buffer): ParseResult {
  // NO se usa `cellDates: true` a propósito. Las columnas de fecha vienen
  // documentadas como UTC, pero esa opción interpreta el número de serie de
  // Excel como hora LOCAL y devuelve un Date corrido por el offset de la
  // máquina: en Lima (UTC-5), 16:19:03 UTC se convierte en 21:19:38Z.
  // Leyendo con `raw: false` se toma el texto ya formateado por la planilla,
  // que sí respeta el UTC declarado en la cabecera de la columna.
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const missingSheets = [
    CLOSED_POSITIONS_SHEET,
    OPEN_POSITIONS_SHEET,
    CASH_OPERATIONS_SHEET,
  ].filter((name) => !workbook.SheetNames.includes(name));

  if (missingSheets.length > 0) {
    throw new Error(
      `El archivo no tiene el formato esperado de export de XTB. Faltan las hojas: ${missingSheets.join(', ')}.`,
    );
  }

  const closedRows = sheetToRows(workbook, CLOSED_POSITIONS_SHEET);
  const openRows = sheetToRows(workbook, OPEN_POSITIONS_SHEET);
  const cashRows = sheetToRows(workbook, CASH_OPERATIONS_SHEET);

  const currency = findAccountCurrency([closedRows, openRows, cashRows]);

  const operations: ParsedOperation[] = [];
  const errors: ParseError[] = [];

  parsePositionsSheet(
    CLOSED_POSITIONS_SHEET,
    closedRows,
    CLOSED_POSITION_ID_COLUMN,
    currency,
    operations,
    errors,
  );
  parsePositionsSheet(
    OPEN_POSITIONS_SHEET,
    openRows,
    OPEN_POSITION_ID_COLUMN,
    currency,
    operations,
    errors,
  );
  parseDividends(cashRows, currency, operations, errors);

  return { operations, errors };
}

function sheetToRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
  });
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Moneda de la cuenta. Aparece en un bloque de resumen con el rótulo
 * "Currency" y el valor en la fila de abajo; en el formato actual ese bloque
 * solo está en `Open Positions`, así que se buscan todas las hojas en vez de
 * asumir una.
 */
function findAccountCurrency(sheets: SheetRow[][]): string {
  for (const rows of sheets) {
    for (let i = 0; i < rows.length - 1; i++) {
      const idx = rows[i].findIndex((cell) => normalize(cell) === 'currency');
      if (idx === -1) continue;
      const value = String(rows[i + 1]?.[idx] ?? '').trim();
      if (value) return value;
    }
  }
  throw new Error('No se pudo determinar la moneda de la cuenta en el archivo.');
}

/**
 * Índice de columnas por nombre normalizado. La normalización no es cosmética:
 * XTB capitaliza distinto la misma columna según la hoja ("Open Price" en
 * cerradas, "Open price" en abiertas).
 */
function buildColumnIndex(header: SheetRow): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, idx) => {
    const key = normalize(name);
    if (key && !(key in map)) map[key] = idx;
  });
  return map;
}

/** Fila de encabezado: la primera que contenga `key` en cualquier columna. */
function findHeaderRow(rows: SheetRow[], key: string): number {
  const target = normalize(key);
  return rows.findIndex((row) =>
    row.some((cell) => normalize(cell) === target),
  );
}

function cellAt(
  row: SheetRow,
  columns: Record<string, number>,
  name: string,
): unknown {
  const idx = columns[normalize(name)];
  return idx === undefined ? '' : row[idx];
}

function parseAmount(raw: unknown): number {
  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') {
    throw new Error(`Monto inválido: "${raw}"`);
  }
  const value = Number(cleaned);
  if (Number.isNaN(value)) {
    throw new Error(`Monto inválido: "${raw}"`);
  }
  return value;
}

/**
 * Fechas del export: `YYYY-MM-DD HH:mm:ss`, en UTC según la cabecera de cada
 * columna. Se construyen con `Date.UTC` para no depender de la zona horaria de
 * la máquina que corre la importación.
 */
function parseXtbDate(raw: unknown): Date {
  const match = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Fecha inválida: "${raw}"`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
}

function parsePositionsSheet(
  sheetName: string,
  rows: SheetRow[],
  positionIdColumn: string,
  currency: string,
  operations: ParsedOperation[],
  errors: ParseError[],
): void {
  const headerIdx = findHeaderRow(rows, positionIdColumn);
  if (headerIdx === -1) {
    errors.push({
      sheet: sheetName,
      row: 0,
      message: `No se encontró la fila de encabezado ("${positionIdColumn}").`,
    });
    return;
  }
  const columns = buildColumnIndex(rows[headerIdx]);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const positionId = String(cellAt(row, columns, positionIdColumn)).trim();
    const type = String(cellAt(row, columns, 'Type')).trim().toUpperCase();

    // Descarta de un saque las filas que no son operaciones: en `Open
    // Positions` hay una fila de resumen por instrumento (con el nombre de la
    // empresa y el tipo vacío) y en `Cash Operations` una fila "Total".
    if (!positionId || (type !== 'BUY' && type !== 'SELL')) continue;

    try {
      const symbol = String(cellAt(row, columns, 'Ticker')).trim();
      if (!symbol) throw new Error('Ticker vacío');

      const volume = Math.abs(parseAmount(cellAt(row, columns, 'Volume')));
      const openPrice = Math.abs(
        parseAmount(cellAt(row, columns, 'Open price')),
      );
      const openTime = parseXtbDate(cellAt(row, columns, 'Open time (UTC)'));

      const commissionRaw = cellAt(row, columns, 'Commission');
      const commission =
        String(commissionRaw).trim() === ''
          ? 0
          : Math.abs(parseAmount(commissionRaw));

      const openLegType: ParsedOperationType = type === 'BUY' ? 'BUY' : 'SELL';
      const closeLegType: ParsedOperationType = type === 'BUY' ? 'SELL' : 'BUY';

      // Una misma Position ID puede repetirse en varias filas cuando XTB
      // registra cierres parciales: cada fila es su propia porción (volumen
      // distinto) de la misma posición. El volumen distingue las filas.
      const rowKey = `${positionId}-${volume.toFixed(4)}`;

      operations.push({
        externalId: `xtb-pos-${rowKey}-open`,
        type: openLegType,
        symbol,
        date: openTime,
        quantity: volume,
        price: openPrice,
        commission,
        currency,
      });

      const closeTimeRaw = cellAt(row, columns, 'Close time (UTC)');
      if (closeTimeRaw && String(closeTimeRaw).trim()) {
        const closePrice = Math.abs(
          parseAmount(cellAt(row, columns, 'Close price')),
        );
        operations.push({
          externalId: `xtb-pos-${rowKey}-close`,
          type: closeLegType,
          symbol,
          date: parseXtbDate(closeTimeRaw),
          quantity: volume,
          price: closePrice,
          commission: 0,
          currency,
        });
      }
    } catch (err) {
      errors.push({
        sheet: sheetName,
        row: i + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function parseDividends(
  rows: SheetRow[],
  currency: string,
  operations: ParsedOperation[],
  errors: ParseError[],
): void {
  const sheetName = CASH_OPERATIONS_SHEET;
  const headerIdx = findHeaderRow(rows, 'ID');
  if (headerIdx === -1) {
    errors.push({
      sheet: sheetName,
      row: 0,
      message: 'No se encontró la fila de encabezado ("ID").',
    });
    return;
  }
  const columns = buildColumnIndex(rows[headerIdx]);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(cellAt(row, columns, 'ID')).trim();
    const type = normalize(cellAt(row, columns, 'Type'));

    // La hoja trae también compras, ventas, retenciones, comisiones y una fila
    // "Total": solo interesan los dividendos.
    if (!id || type !== DIVIDEND_TYPE) continue;

    try {
      // Si el ticker viniera vacío, el símbolo aparece como primer token del
      // comentario (ej. "PEP.US USD 1.48/ SHR").
      const symbol =
        String(cellAt(row, columns, 'Ticker')).trim() ||
        String(cellAt(row, columns, 'Comment')).trim().split(/\s+/)[0];
      if (!symbol) throw new Error('Ticker vacío');

      const amount = parseAmount(cellAt(row, columns, 'Amount'));
      const date = parseXtbDate(cellAt(row, columns, 'Time'));

      operations.push({
        externalId: `xtb-cash-${id}`,
        type: 'DIVIDEND',
        symbol,
        date,
        quantity: 1,
        price: amount,
        commission: 0,
        currency,
      });
    } catch (err) {
      errors.push({
        sheet: sheetName,
        row: i + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
