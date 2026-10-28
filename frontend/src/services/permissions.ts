import type { State } from '../types';
export function can(state: State | null, permission: string): boolean {
  return Boolean(
    state && Array.isArray(state.permissions) && state.permissions.includes(permission),
  );
}
