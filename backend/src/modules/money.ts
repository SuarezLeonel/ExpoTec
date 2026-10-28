import { ensure } from './errors.js';

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
export function proportionalCents(base: number, numerator: number, denominator: number): number {
  return Number((BigInt(base) * BigInt(numerator)) / BigInt(denominator));
}
