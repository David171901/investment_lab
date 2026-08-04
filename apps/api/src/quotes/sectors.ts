/**
 * Agrupación de industrias a sectores amplios (Fase 3.6).
 *
 * Finnhub no devuelve sectores GICS: devuelve una industria granular
 * (`finnhubIndustry`), con más de cien valores posibles. Para un portafolio
 * personal eso da casi tantos grupos como posiciones — con 13 posiciones daba
 * 10 industrias distintas, 7 de ellas con una sola empresa — y un gráfico de
 * distribución con esa granularidad no comunica nada.
 *
 * Esta tabla colapsa esas industrias en sectores amplios. Es deliberadamente
 * manual y deliberadamente corta: cubre lo que aparece en la cartera y algo de
 * margen. Una industria no mapeada NO es un error, cae en `FALLBACK_SECTOR` y
 * se sigue viendo en el gráfico; el costo de olvidarse de agregar una es que
 * quede agrupada en "Otros", no que se pierda.
 *
 * Las claves se comparan en minúsculas para no depender de cómo capitalice el
 * proveedor.
 */

export const FALLBACK_SECTOR = 'Otros';

const INDUSTRY_TO_SECTOR: Record<string, string> = {
  // --- Tecnología y Comunicación ---
  technology: 'Tecnología y Comunicación',
  'communications': 'Tecnología y Comunicación',
  media: 'Tecnología y Comunicación',
  semiconductors: 'Tecnología y Comunicación',
  telecommunication: 'Tecnología y Comunicación',
  'electronic equipment': 'Tecnología y Comunicación',

  // --- Financiero ---
  banking: 'Financiero',
  insurance: 'Financiero',
  'financial services': 'Financiero',
  'diversified financial services': 'Financiero',
  'investment banking': 'Financiero',

  // --- Salud ---
  pharmaceuticals: 'Salud',
  biotechnology: 'Salud',
  'health care': 'Salud',
  'life sciences tools & services': 'Salud',

  // --- Consumo defensivo ---
  'consumer products': 'Consumo defensivo',
  beverages: 'Consumo defensivo',
  'food products': 'Consumo defensivo',
  tobacco: 'Consumo defensivo',
  'retail - defensive': 'Consumo defensivo',

  // --- Consumo discrecional ---
  retail: 'Consumo discrecional',
  'hotels, restaurants & leisure': 'Consumo discrecional',
  automobiles: 'Consumo discrecional',
  'textiles, apparel & luxury goods': 'Consumo discrecional',

  // --- Industrial y Transporte ---
  'logistics & transportation': 'Industrial y Transporte',
  'road & rail': 'Industrial y Transporte',
  airlines: 'Industrial y Transporte',
  machinery: 'Industrial y Transporte',
  aerospace: 'Industrial y Transporte',
  'building materials': 'Industrial y Transporte',
  'industrial conglomerates': 'Industrial y Transporte',

  // --- Materiales y Energía ---
  'metals & mining': 'Materiales y Energía',
  chemicals: 'Materiales y Energía',
  'oil & gas': 'Materiales y Energía',
  energy: 'Materiales y Energía',
  utilities: 'Materiales y Energía',

  // --- Inmobiliario ---
  'real estate': 'Inmobiliario',
  reit: 'Inmobiliario',
};

/** Sector amplio para una industria del proveedor. Nunca devuelve vacío. */
export function sectorForIndustry(industry: string | null | undefined): string {
  if (!industry) return FALLBACK_SECTOR;
  return INDUSTRY_TO_SECTOR[industry.trim().toLowerCase()] ?? FALLBACK_SECTOR;
}
