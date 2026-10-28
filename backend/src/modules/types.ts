import type { Request } from 'express';
import type { PoolClient } from 'pg';

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
}
export interface AuthRequest extends Request {
  user: User;
  permissions: string[];
  sessionId: string;
  csrf: string;
  mode: 'terminal' | 'management';
  operator?: User;
  grantTableId?: string;
}
export interface CommandContext {
  db: PoolClient;
  user: User;
  permissions: string[];
  operationId: string;
  mode?: 'terminal' | 'management';
}
export interface Account {
  id: string;
  table_id: string;
  waiter_id: string;
  guests: number;
  status: string;
  version: number;
  subtotal_cents: number;
  discount_cents: number;
  refunded_cents: number;
  original_total_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
}
export interface Item {
  id: string;
  account_id: string;
  product_id: string;
  name: string;
  description: string;
  unit_cents: number;
  effective_unit_cents: number;
  line_cents: number;
  quantity: number;
  notes: string;
  destination: string;
  status: string;
}
