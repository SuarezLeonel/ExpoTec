import { useRef, useState } from 'react';
import type { Addon, Item, Product } from '../types';
import { readPending } from '../services/api';

export function useLocalOrder(operatorId: string, tableId: string) {
  const key = `baguette.local-order.v1.${operatorId}.${tableId}`;
  const [savedDraft, setSavedDraft] = useState<{
    accountId: string;
    items: Item[];
    guests: number;
  }>(() => {
    try {
      const queued = new Set(
        readPending(`terminal.${operatorId}`).flatMap((p) => p.preview?.map((i) => i.id) || []),
      );
      const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      const record =
        saved && !Array.isArray(saved) && typeof saved === 'object'
          ? (saved as { accountId?: unknown; items?: unknown; guests?: unknown })
          : {};
      const values = Array.isArray(saved) ? saved : record.items;
      const items = Array.isArray(values)
        ? values.filter(
            (i): i is Item =>
              i &&
              typeof i.id === 'string' &&
              typeof i.product_id === 'string' &&
              typeof i.name === 'string' &&
              Number.isInteger(i.quantity) &&
              i.quantity >= 1 &&
              i.quantity <= 100 &&
              typeof i.notes === 'string' &&
              Array.isArray(i.addons) &&
              !queued.has(i.id),
          )
        : [];
      return {
        accountId: typeof record.accountId === 'string' ? record.accountId : '',
        items,
        guests:
          typeof record.guests === 'number' &&
          Number.isInteger(record.guests) &&
          record.guests >= 1 &&
          record.guests <= 50
            ? record.guests
            : 1,
      };
    } catch {
      return { accountId: '', items: [], guests: 1 };
    }
  });
  const current = useRef(savedDraft);
  function save(
    items: Item[],
    accountId = current.current.accountId,
    guests = current.current.guests,
  ) {
    const next = { accountId, items, guests };
    if (items.length === 0 && !accountId && guests === 1) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(next));
    current.current = next;
    setSavedDraft(next);
  }
  return {
    items: savedDraft.items,
    accountId: savedDraft.accountId,
    guests: savedDraft.guests,
    changeGuests(guests: number) {
      save(current.current.items, current.current.accountId, guests);
    },
    add(product: Product, quantity: number, addons: Addon[], notes: string, accountId = '') {
      const matching = current.current.items.find(
        (item) =>
          item.product_id === product.id &&
          item.notes === notes &&
          item.unit_cents === product.price_cents &&
          item.addons.length === addons.length &&
          item.addons.every((addon) =>
            addons.some((a) => a.id === addon.id && a.price_cents === addon.price_cents),
          ) &&
          item.quantity + quantity <= 100,
      );
      if (matching) {
        save(
          current.current.items.map((item) =>
            item.id === matching.id ? { ...item, quantity: item.quantity + quantity } : item,
          ),
          accountId,
        );
        return;
      }
      if (current.current.items.length >= 100)
        throw new Error('Enviá este pedido antes de agregar más productos.');
      save(
        [
          ...current.current.items,
          {
            id: crypto.randomUUID(),
            account_id: '',
            product_id: product.id,
            name: product.name,
            description: product.description,
            unit_cents: product.price_cents,
            quantity,
            notes,
            addons,
            destination: product.destination,
            status: 'draft',
            created_at: new Date().toISOString(),
          },
        ],
        accountId,
      );
    },
    edit(id: string, changes: Partial<Pick<Item, 'quantity' | 'notes'>>) {
      save(current.current.items.map((i) => (i.id === id ? { ...i, ...changes } : i)));
    },
    remove(id: string) {
      save(current.current.items.filter((i) => i.id !== id));
    },
    clear() {
      save([], '', 1);
    },
  };
}
