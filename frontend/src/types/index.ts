export type Role = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'bar' | 'terminal';
export interface User {
  id: string;
  name: string;
  role: Role;
  username?: string;
  active?: boolean;
  created_at?: string;
}
export interface Table {
  id: string;
  label: string;
  capacity: number;
  sector: string;
  x: number;
  y: number;
  active: boolean;
  group_id?: string | null;
  shape?: 'round' | 'square' | 'rectangular';
  width?: number;
  height?: number;
  rotation?: number;
}
export interface FloorElement {
  id: string;
  kind: 'wall' | 'door' | 'separator' | 'chair';
  sector: 'Salón' | 'Patio';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface FloorLayout {
  tables: (Required<Pick<Table, 'id' | 'label' | 'capacity' | 'sector' | 'x' | 'y' | 'active'>> & {
    shape: 'round' | 'square' | 'rectangular';
    width: number;
    height: number;
    rotation: number;
  })[];
  elements: FloorElement[];
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
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  created_at: string;
}
export interface Addon {
  id: string;
  name: string;
  price_cents: number;
  active?: boolean;
}
export interface Product {
  id: string;
  name: string;
  variant_group?: string;
  variant_name?: string;
  description: string;
  category_id: string;
  price_cents: number;
  image_url: string | null;
  destination: string;
  available: boolean;
  active: boolean;
  visible_en_carta: boolean;
  addon_ids?: string[];
  created_at: string;
}
export interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_order?: number;
  active?: boolean;
}
export interface Item {
  id: string;
  account_id: string;
  product_id: string;
  name: string;
  description: string;
  unit_cents: number;
  quantity: number;
  notes: string;
  destination: string;
  status: string;
  addons: Addon[];
  created_at: string;
}
export type Row = Record<string, unknown> & { id: string };
export interface State {
  timezone?: string;
  user: User;
  tables: Table[];
  accounts: Account[];
  items: Item[];
  products: Product[];
  categories: Category[];
  addons: Addon[];
  users: User[];
  cashSessions: Row[];
  cashMovements: Row[];
  payments: Row[];
  refunds: Row[];
  discounts: Row[];
  printJobs: Row[];
  invoices: Row[];
  files: Row[];
  permissions: unknown;
  floorPlan?: { published: FloorLayout; version: number } | null;
  floorPlanDraft?: {
    draft: FloorLayout;
    draft_revision: number;
    version: number;
  } | null;
}
export interface Session {
  user: User;
  csrf: string;
  mode?: 'terminal' | 'management';
}
export interface OperationalGrant {
  token: string;
  expires_in: number;
  operator: User;
  permissions: string[];
  table_state?: Pick<
    State,
    'accounts' | 'items' | 'payments' | 'refunds' | 'discounts' | 'cashSessions'
  >;
}
export interface Pending {
  preview?: Item[];
  actor_id?: string;
  table_id?: string;
  key: string;
  action: string;
  body: Record<string, unknown>;
  state: 'pending' | 'uncertain' | 'failed';
  error?: string;
  created_at: string;
  replayable?: boolean;
}
export interface Download {
  id: string;
  name: string;
  content_base64: string;
  mime: string;
}
