import { Prisma } from '../../generated/prisma/client';

const D = Prisma.Decimal;
type DecimalValue = Prisma.Decimal;

// Mismo umbral que en `portfolio.service.ts`: por debajo de esto, una
// cantidad se considera cero (XTB opera con fracciones y quedan residuos de
// redondeo tras compras/ventas).
const EPSILON = new D('0.00000001');

export interface CycleOperation {
  type: 'BUY' | 'SELL';
  date: Date;
  quantity: DecimalValue;
  price: DecimalValue;
  commission: DecimalValue;
}

// Un ciclo completo de "compra hasta cero y volvé a cero": desde la primera
// compra que abre la posición hasta la venta que la deja en cantidad cero.
export interface ClosedCycle {
  openDate: Date;
  closeDate: Date;
  quantity: DecimalValue; // total operado en el ciclo (comprado = vendido)
  averageBuyPrice: DecimalValue; // precio, sin comisión
  averageSellPrice: DecimalValue; // precio, sin comisión
  totalBuyCost: DecimalValue; // costo con comisión incluida (para el % de retorno)
  realizedPnL: DecimalValue;
}

/**
 * Detecta ciclos de compra-venta a partir de las operaciones de UN instrumento,
 * ya ordenadas cronológicamente (compra antes que venta en el mismo instante,
 * igual que en `PortfolioService.compute`).
 *
 * El modelo de datos no distingue "ciclos": una posición es simplemente la
 * cantidad neta acumulada de sus operaciones. Un ciclo cerrado se define acá
 * como el tramo entre dos cruces por cero — se abre en la primera compra tras
 * estar en cero, y se cierra en la venta que vuelve a dejar la cantidad en
 * cero. Si una empresa se compró y vendió por completo más de una vez, esto
 * produce una fila por cada vez, en vez de mezclar ciclos distintos en un
 * único promedio.
 *
 * Una posición que sigue abierta al final de las operaciones (o que nunca
 * volvió a cero) no genera ciclo: eso es responsabilidad de `getPositions`.
 */
export function computeClosedCycles(ops: CycleOperation[]): ClosedCycle[] {
  const cycles: ClosedCycle[] = [];

  let quantity = new D(0);
  let averageCost = new D(0); // costo promedio ponderado vigente (incluye comisión de compra)

  let openDate: Date | null = null;
  let buyQty = new D(0);
  let buyPriceQty = new D(0); // suma de cantidad*precio (sin comisión) de las compras del ciclo
  let buyCost = new D(0); // suma de cantidad*precio + comisión (para el costo base del ciclo)
  let sellQty = new D(0);
  let sellPriceQty = new D(0);
  let cyclePnL = new D(0);

  const resetCycle = () => {
    openDate = null;
    buyQty = new D(0);
    buyPriceQty = new D(0);
    buyCost = new D(0);
    sellQty = new D(0);
    sellPriceQty = new D(0);
    cyclePnL = new D(0);
  };

  for (const op of ops) {
    if (op.type === 'BUY') {
      if (quantity.lessThanOrEqualTo(EPSILON)) {
        // Cantidad en cero (o arrancando): esta compra abre un ciclo nuevo.
        resetCycle();
        openDate = op.date;
      }

      const addedCost = op.quantity.times(op.price).plus(op.commission);
      const newQuantity = quantity.plus(op.quantity);
      const totalCost = averageCost.times(quantity).plus(addedCost);
      averageCost = newQuantity.isZero() ? new D(0) : totalCost.dividedBy(newQuantity);
      quantity = newQuantity;

      buyQty = buyQty.plus(op.quantity);
      buyPriceQty = buyPriceQty.plus(op.quantity.times(op.price));
      buyCost = buyCost.plus(addedCost);
    } else {
      // SELL sin compra previa en este recorrido (dato inconsistente, no
      // debería ocurrir tras el parseo): se ignora en vez de romper el cálculo.
      if (openDate === null) continue;

      const eventPnL = op.quantity.times(op.price.minus(averageCost)).minus(op.commission);
      cyclePnL = cyclePnL.plus(eventPnL);
      sellQty = sellQty.plus(op.quantity);
      sellPriceQty = sellPriceQty.plus(op.quantity.times(op.price));

      quantity = quantity.minus(op.quantity);

      if (quantity.abs().lessThanOrEqualTo(EPSILON)) {
        quantity = new D(0);
        averageCost = new D(0);

        cycles.push({
          openDate: openDate,
          closeDate: op.date,
          quantity: buyQty,
          averageBuyPrice: buyQty.isZero() ? new D(0) : buyPriceQty.dividedBy(buyQty),
          averageSellPrice: sellQty.isZero() ? new D(0) : sellPriceQty.dividedBy(sellQty),
          totalBuyCost: buyCost,
          realizedPnL: cyclePnL,
        });

        resetCycle();
      }
    }
  }

  return cycles;
}
