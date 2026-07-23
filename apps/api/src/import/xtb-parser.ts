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

const CLOSED_POSITIONS_SHEET = 'CLOSED POSITION HISTORY';
const CASH_OPERATIONS_SHEET = 'CASH OPERATION HISTORY';
const OPEN_POSITIONS_SHEET_PREFIX = 'OPEN POSITION';

export function parseXtbWorkbook(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const openSheetName = workbook.SheetNames.find((name) =>
    name.trim().startsWith(OPEN_POSITIONS_SHEET_PREFIX),
  );

  const missingSheets: string[] = [];
  if (!workbook.SheetNames.includes(CLOSED_POSITIONS_SHEET)) missingSheets.push(CLOSED_POSITIONS_SHEET);
  if (!openSheetName) missingSheets.push(`${OPEN_POSITIONS_SHEET_PREFIX} *`);
  if (!workbook.SheetNames.includes(CASH_OPERATIONS_SHEET)) missingSheets.push(CASH_OPERATIONS_SHEET);
  if (missingSheets.length > 0) {
    throw new Error(
      `El archivo no tiene el formato esperado de export de XTB. Faltan las hojas: ${missingSheets.join(', ')}.`,
    );
  }

  const closedRows = sheetToRows(workbook, CLOSED_POSITIONS_SHEET);
  const openRows = sheetToRows(workbook, openSheetName as string);
  const cashRows = sheetToRows(workbook, CASH_OPERATIONS_SHEET);

  const currency = findAccountCurrency(closedRows);

  const operations: ParsedOperation[] = [];
  const errors: ParseError[] = [];

  parsePositionsSheet(CLOSED_POSITIONS_SHEET, closedRows, currency, operations, errors);
  parsePositionsSheet(openSheetName as string, openRows, currency, operations, errors);
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

function findAccountCurrency(rows: SheetRow[]): string {
  for (let i = 0; i < rows.length - 1; i++) {
    const idx = rows[i].findIndex((cell) => String(cell).trim() === 'Currency');
    if (idx !== -1) {
      const value = String(rows[i + 1]?.[idx] ?? '').trim();
      if (value) return value;
    }
  }
  throw new Error('No se pudo determinar la moneda de la cuenta en el archivo.');
}

function buildColumnIndex(header: SheetRow): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, idx) => {
    const key = String(name).trim();
    if (key && !(key in map)) map[key] = idx;
  });
  return map;
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

function parseXtbDate(raw: unknown): Date {
  const match = String(raw)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Fecha inválida: "${raw}"`);
  }
  const [, day, month, year, hour, minute, second] = match;
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
}

function parsePositionsSheet(
  sheetName: string,
  rows: SheetRow[],
  currency: string,
  operations: ParsedOperation[],
  errors: ParseError[],
): void {
  const headerIdx = rows.findIndex((row) => String(row[0]).trim() === 'Position');
  if (headerIdx === -1) {
    errors.push({ sheet: sheetName, row: 0, message: 'No se encontró la fila de encabezado ("Position").' });
    return;
  }
  const columns = buildColumnIndex(rows[headerIdx]);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const positionId = String(row[columns['Position']] ?? '').trim();
    const type = String(row[columns['Type']] ?? '').trim().toUpperCase();

    if (!positionId || (type !== 'BUY' && type !== 'SELL')) continue;

    try {
      const symbol = String(row[columns['Symbol']] ?? '').trim();
      if (!symbol) throw new Error('Symbol vacío');

      const volume = Math.abs(parseAmount(row[columns['Volume']]));
      const openPrice = Math.abs(parseAmount(row[columns['Open price']]));
      const openTime = parseXtbDate(row[columns['Open time']]);
      const commission = 'Commission' in columns ? Math.abs(parseAmount(row[columns['Commission']])) : 0;

      const openLegType: ParsedOperationType = type === 'BUY' ? 'BUY' : 'SELL';
      const closeLegType: ParsedOperationType = type === 'BUY' ? 'SELL' : 'BUY';

      // Una misma Position ID puede repetirse en varias filas cuando XTB registra
      // cierres parciales: cada fila es su propia porción (volumen distinto) del
      // mismo Position ID, con el mismo Open time/price. El volumen distingue las filas.
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

      const closeTimeRaw = row[columns['Close time']];
      if (closeTimeRaw && String(closeTimeRaw).trim()) {
        const closePrice = Math.abs(parseAmount(row[columns['Close price']]));
        const closeTime = parseXtbDate(closeTimeRaw);
        operations.push({
          externalId: `xtb-pos-${rowKey}-close`,
          type: closeLegType,
          symbol,
          date: closeTime,
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
  const headerIdx = rows.findIndex((row) => String(row[0]).trim() === 'ID');
  if (headerIdx === -1) {
    errors.push({ sheet: sheetName, row: 0, message: 'No se encontró la fila de encabezado ("ID").' });
    return;
  }
  const columns = buildColumnIndex(rows[headerIdx]);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[columns['ID']] ?? '').trim();
    const type = String(row[columns['Type']] ?? '').trim();

    if (!id || type !== 'DIVIDENT') continue;

    try {
      // El export de XTB a veces deja la columna Symbol vacía para dividendos;
      // en ese caso el símbolo aparece como primer token del Comment (ej. "PEP.US USD 1.48/ SHR").
      const symbol =
        String(row[columns['Symbol']] ?? '').trim() ||
        String(row[columns['Comment']] ?? '').trim().split(/\s+/)[0];
      if (!symbol) throw new Error('Symbol vacío');

      const amount = parseAmount(row[columns['Amount']]);
      const date = parseXtbDate(row[columns['Time']]);

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
