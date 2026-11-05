/**
 * Verificación de permisos y capacidades del usuario activo.
 *
 * Determina si el usuario en sesión tiene habilitada una acción específica (`manage_tables`, `cash`, `void_item`, etc.).
 */

import type { State } from '../types';

export function can(state: State | null, permission: string): boolean {
  return Boolean(
    state && Array.isArray(state.permissions) && state.permissions.includes(permission),
  );
}
