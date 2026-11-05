/**
 * Agrupación de productos y gestión de variantes de la carta.
 *
 * Funciones provistas:
 * - `groupProducts`: Agrupa productos individuales que comparten la misma familia (`variant_group`) bajo una ficha unificada.
 * - `matchesProductGroup`: Búsqueda flexible de productos insensible a mayúsculas, minúsculas y acentos diacríticos.
 * - `groupPrice`: Obtiene el rango o precio mínimo disponible de una familia de productos.
 */

import type { Product } from '../types';

export interface ProductGroup {
  id: string;
  name: string;
  category_id: string;
  variants: Product[];
  hasVariations: boolean;
}

export function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function groupProducts(products: Product[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const product of products) {
    const family = product.variant_group?.trim();
    const id = family
      ? `${product.category_id}:family:${searchText(family)}`
      : `${product.category_id}:product:${product.id}`;
    const existing = groups.get(id);
    if (existing) existing.variants.push(product);
    else
      groups.set(id, {
        id,
        name: family || product.name,
        category_id: product.category_id,
        variants: [product],
        hasVariations: Boolean(family),
      });
  }
  return [...groups.values()];
}

export function matchesProductGroup(group: ProductGroup, query: string) {
  const words = searchText(query).split(/\s+/).filter(Boolean);
  return group.variants.some((p) => {
    const text = searchText(`${group.name} ${p.name} ${p.variant_name || ''} ${p.description}`);
    return words.every((word) => text.includes(word));
  });
}

export function groupPrice(group: ProductGroup) {
  const available = group.variants.filter((p) => p.available);
  return Math.min(
    ...(available.length ? available : group.variants).map((p) => Number(p.price_cents)),
  );
}
