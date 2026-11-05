/**
 * Aritmética financiera en centavos enteros para operaciones comerciales.
 *
 * Todos los importes monetarios del sistema se expresan y almacenan en centavos enteros
 * (`amount_cents`), previniendo errores de precisión inherentes al punto flotante de JavaScript.
 */

import { ensure } from './errors.js';

/**
 * Divide un importe en partes iguales entre varios comensales, distribuyendo el resto
 * de a 1 centavo en las primeras partes para garantizar que la suma de las partes
 * sea exactamente igual al total original (sin perder ni inventar centavos).
 *
 * @param amount Importe total en centavos.
 * @param parts Cantidad de comensales (entre 2 y 30).
 * @returns Vector con el importe en centavos asignado a cada comensal.
 */
export function splitCents(amount: number, parts: number): number[] {
  ensure(
    Number.isSafeInteger(amount) &&
      amount >= 0 &&
      Number.isInteger(parts) &&
      parts >= 2 &&
      parts <= 30,
    422,
    'INVALID_SPLIT',
    'Importe o cantidad de partes inválidos.',
  );
  const base = Math.floor(amount / parts);
  return Array.from({ length: parts }, (_, i) => base + (i < amount % parts ? 1 : 0));
}

/**
 * Aplica un porcentaje de descuento con redondeo comercial estándar (mitad hacia arriba).
 * Utiliza aritmética de enteros con BigInt para evitar cualquier distorsión de cálculo.
 *
 * @param base Importe base en centavos.
 * @param percentage Porcentaje a calcular (1 a 100).
 * @returns Importe resultante en centavos con redondeo comercial.
 */
export function percentCents(base: number, percentage: number): number {
  ensure(
    Number.isSafeInteger(base) &&
      base >= 0 &&
      Number.isInteger(percentage) &&
      percentage >= 1 &&
      percentage <= 100,
    422,
    'INVALID_DISCOUNT',
    'Porcentaje inválido.',
  );
  return Number((BigInt(base) * BigInt(percentage) + 50n) / 100n);
}

/**
 * Calcula una proporción exacta de centavos: `(base * numerator) / denominator`.
 */
export function proportionalCents(base: number, numerator: number, denominator: number): number {
  return Number((BigInt(base) * BigInt(numerator)) / BigInt(denominator));
}
