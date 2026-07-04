-- ============================================================
-- FoodHub POS — Database Schema
-- Multi-tenant | Supabase Auth | Inventory | Multi-channel Orders
-- ============================================================

-- ── ENUMS ──────────────────────────────────────────────────

create type order_type        as enum ('table', 'pickup', 'online', 'whatsapp');
create type order_status      as enum ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded');
create type payment_method    as enum ('cash', 'card', 'transfer', 'online_gateway', 'whatsapp_pay');
create type payment_status    as enum ('pending', 'paid', 'partial', 'refunded');
create type product_status    as enum ('available', 'unavailable', 'archived');
create type movement_type     as enum ('purchase', 'sale', 'adjustment', 'waste', 'transfer_in', 'transfer_out');
create type staff_role        as enum ('owner', 'admin', 'manager', 'cashier', 'kitchen');
create type plan_type         as enum ('starter', 'pro', 'enterprise');


-- ── ORGANIZATIONS (root tenant) ────────────────────────────

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  slug             text        unique not null,         -- URL slug: foodhub-las-condes
  logo_url         text,
  primary_color    text        default '#000000',
  phone            text,
  email            text,
  address          text,
  country_code     char(2)     default 'CL',
  currency         char(3)     default 'CLP',
  default_tax_rate numeric(5,2) default 19.00,         -- % IVA
  timezone         text        default 'America/Santiago',
  plan             plan_type   default 'starter',
  is_active        boolean     default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);


-- ── BRANCHES (sucursales) ──────────────────────────────────

create table branches (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid        not null references organizations(id) on delete cascade,
  name                text        not null,
  address             text,
  phone               text,
  latitude            numeric(10,7),
  longitude           numeric(10,7),
  is_active           boolean     default true,
  -- Channels enabled per branch
  accepts_table       boolean     default true,
  accepts_pickup      boolean     default true,
  accepts_online      boolean     default false,
  accepts_whatsapp    boolean     default false,
  whatsapp_number     text,
  opening_hours       jsonb,       -- {"mon":{"open":"09:00","close":"22:00"}, ...}
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index on branches(organization_id);


-- ── STAFF (uses Supabase Auth) ─────────────────────────────

create table staff (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid        not null references organizations(id) on delete cascade,
  full_name       text,
  avatar_url      text,
  role            staff_role  not null default 'cashier',
  is_active       boolean     default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on staff(organization_id);

-- Which branches each staff member has access to
create table staff_branches (
  staff_id    uuid references staff(id) on delete cascade,
  branch_id   uuid references branches(id) on delete cascade,
  primary key (staff_id, branch_id)
);


-- ── CATEGORIES ─────────────────────────────────────────────

create table categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  parent_id       uuid        references categories(id) on delete set null,  -- subcategories
  name            text        not null,
  description     text,
  image_url       text,
  sort_order      int         default 0,
  is_active       boolean     default true,
  show_in_pos     boolean     default true,
  show_online     boolean     default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on categories(organization_id);
create index on categories(parent_id);


-- ── PRODUCTS ───────────────────────────────────────────────

create table products (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid            not null references organizations(id) on delete cascade,
  name               text            not null,
  description        text,
  sku                text,
  gtin               text,
  base_price         numeric(12,2)   not null default 0,
  cost_price         numeric(12,2),                    -- para calcular margen
  tax_rate           numeric(5,2),                     -- null = usa default de organization
  type               text            default 'physical',  -- physical | service | bundle
  status             product_status  default 'available',
  track_inventory    boolean         default false,
  sold_by_weight     boolean         default false,     -- precio por kg/g
  is_active          boolean         default true,
  created_at         timestamptz     default now(),
  updated_at         timestamptz     default now()
);

create index on products(organization_id);
create index on products(status);

-- Multiple images per product
create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid    not null references products(id) on delete cascade,
  url         text    not null,
  alt_text    text,
  sort_order  int     default 0,
  is_primary  boolean default false,
  created_at  timestamptz default now()
);

-- N:M Products <-> Categories
create table product_categories (
  product_id  uuid references products(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  sort_order  int default 0,
  primary key (product_id, category_id)
);

-- Price override and availability per branch
create table product_branches (
  product_id     uuid references products(id) on delete cascade,
  branch_id      uuid references branches(id) on delete cascade,
  price_override numeric(12,2),   -- null = usa base_price del producto
  is_available   boolean default true,
  primary key (product_id, branch_id)
);


-- ── VARIANTS ───────────────────────────────────────────────

-- Variant group: "Tamaño", "Sabor"
create table variant_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid    not null references products(id) on delete cascade,
  name        text    not null,
  is_required boolean default false,
  sort_order  int     default 0,
  created_at  timestamptz default now()
);

-- Variant option: "Pequeño +$0", "Grande +$500"
create table variant_options (
  id               uuid primary key default gen_random_uuid(),
  variant_group_id uuid          not null references variant_groups(id) on delete cascade,
  name             text          not null,
  sku              text,
  price_modifier   numeric(12,2) default 0,   -- se suma al base_price
  cost_modifier    numeric(12,2) default 0,
  sort_order       int           default 0,
  is_default       boolean       default false,
  is_active        boolean       default true,
  created_at       timestamptz   default now()
);


-- ── MODIFIERS ──────────────────────────────────────────────

-- Modifier group: "Extras", "Sin ingrediente", "Punto de cocción"
create table modifier_groups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid    not null references organizations(id) on delete cascade,
  name            text    not null,
  description     text,
  min_selections  int     default 0,
  max_selections  int,                -- null = sin límite
  is_required     boolean default false,
  created_at      timestamptz default now()
);

create index on modifier_groups(organization_id);

-- Modifier: "Extra queso +$300", "Sin cebolla"
create table modifiers (
  id                uuid primary key default gen_random_uuid(),
  modifier_group_id uuid          not null references modifier_groups(id) on delete cascade,
  name              text          not null,
  price             numeric(12,2) default 0,
  is_active         boolean       default true,
  sort_order        int           default 0,
  created_at        timestamptz   default now()
);

-- Products <-> Modifier Groups
create table product_modifier_groups (
  product_id        uuid references products(id) on delete cascade,
  modifier_group_id uuid references modifier_groups(id) on delete cascade,
  sort_order        int default 0,
  primary key (product_id, modifier_group_id)
);


-- ── INVENTORY ──────────────────────────────────────────────

create table inventory (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  branch_id         uuid          not null references branches(id) on delete cascade,
  product_id        uuid          not null references products(id) on delete cascade,
  variant_option_id uuid          references variant_options(id) on delete cascade,  -- null si no tiene variante
  quantity          numeric(12,3) not null default 0,   -- soporta decimales (kg, litros)
  low_stock_alert   numeric(12,3) default 5,
  unit              text          default 'unit',       -- unit | kg | g | l | ml
  updated_at        timestamptz   default now(),
  unique (branch_id, product_id, variant_option_id)
);

create index on inventory(organization_id);
create index on inventory(branch_id, product_id);

-- Full audit trail of stock changes
create table inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  inventory_id    uuid          not null references inventory(id) on delete cascade,
  type            movement_type not null,
  quantity_change numeric(12,3) not null,    -- + entrada, - salida
  quantity_before numeric(12,3) not null,
  quantity_after  numeric(12,3) not null,
  reference_id    uuid,                       -- order_id, transfer_id, etc.
  notes           text,
  performed_by    uuid          references staff(id),
  created_at      timestamptz   default now()
);

create index on inventory_movements(inventory_id);
create index on inventory_movements(created_at);


-- ── CUSTOMERS ──────────────────────────────────────────────

create table customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid          not null references organizations(id) on delete cascade,
  full_name       text,
  phone           text,                       -- also used as WhatsApp ID
  email           text,
  address         text,
  notes           text,
  total_orders    int           default 0,
  total_spent     numeric(12,2) default 0,
  created_at      timestamptz   default now(),
  updated_at      timestamptz   default now()
);

create index on customers(organization_id);
create index on customers(phone);


-- ── TABLES (mesas físicas) ─────────────────────────────────

create table restaurant_tables (
  id        uuid primary key default gen_random_uuid(),
  branch_id uuid    not null references branches(id) on delete cascade,
  name      text    not null,     -- "Mesa 4", "Terraza 1", "Barra 2"
  capacity  int,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index on restaurant_tables(branch_id);


-- ── ORDERS ─────────────────────────────────────────────────

create table orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid         not null references organizations(id) on delete cascade,
  branch_id       uuid         not null references branches(id) on delete cascade,
  customer_id     uuid         references customers(id),
  table_id        uuid         references restaurant_tables(id),
  staff_id        uuid         references staff(id),

  -- Type & channel
  order_type      order_type   not null default 'table',
  order_number    text         not null,    -- "0001", "0002" (generado por branch)
  status          order_status default 'pending',

  -- Contact / delivery info (for online & whatsapp)
  customer_name   text,
  customer_phone  text,
  delivery_address text,
  delivery_notes  text,
  whatsapp_msg_id text,       -- ID del mensaje de WhatsApp para rastreo

  -- Financials
  subtotal        numeric(12,2) not null default 0,
  tax_amount      numeric(12,2) not null default 0,
  discount_amount numeric(12,2) default 0,
  total           numeric(12,2) not null default 0,

  -- Notes & timing
  notes           text,
  estimated_ready_at  timestamptz,
  confirmed_at        timestamptz,
  ready_at            timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on orders(organization_id, branch_id);
create index on orders(status);
create index on orders(order_type);
create index on orders(created_at);
create unique index on orders(branch_id, order_number);


-- ── ORDER ITEMS ────────────────────────────────────────────

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid          not null references orders(id) on delete cascade,
  product_id     uuid          not null references products(id),
  -- Snapshot del producto al momento del pedido
  product_name   text          not null,
  quantity       int           not null default 1,
  unit_price     numeric(12,2) not null,
  total_price    numeric(12,2) not null,
  notes          text,
  created_at     timestamptz   default now()
);

create index on order_items(order_id);

-- Selected variant per item (snapshot)
create table order_item_variants (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid          not null references order_items(id) on delete cascade,
  variant_group_id    uuid          references variant_groups(id),
  variant_option_id   uuid          references variant_options(id),
  variant_group_name  text          not null,
  variant_option_name text          not null,
  price_modifier      numeric(12,2) default 0
);

-- Selected modifiers per item (snapshot)
create table order_item_modifiers (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid          not null references order_items(id) on delete cascade,
  modifier_group_id   uuid          references modifier_groups(id),
  modifier_id         uuid          references modifiers(id),
  modifier_group_name text          not null,
  modifier_name       text          not null,
  price               numeric(12,2) default 0
);


-- ── PAYMENTS ───────────────────────────────────────────────

create table payments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid           not null references orders(id) on delete cascade,
  method         payment_method not null,
  status         payment_status default 'pending',
  amount         numeric(12,2)  not null,
  tip_amount     numeric(12,2)  default 0,
  change_amount  numeric(12,2)  default 0,   -- vuelto en efectivo
  reference_code text,                       -- código transf., nro autorización tarjeta
  paid_at        timestamptz,
  created_at     timestamptz    default now()
);

create index on payments(order_id);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tenant tables
alter table branches              enable row level security;
alter table staff                 enable row level security;
alter table staff_branches        enable row level security;
alter table categories            enable row level security;
alter table products              enable row level security;
alter table product_images        enable row level security;
alter table product_categories    enable row level security;
alter table product_branches      enable row level security;
alter table variant_groups        enable row level security;
alter table variant_options       enable row level security;
alter table modifier_groups       enable row level security;
alter table modifiers             enable row level security;
alter table product_modifier_groups enable row level security;
alter table inventory             enable row level security;
alter table inventory_movements   enable row level security;
alter table customers             enable row level security;
alter table restaurant_tables     enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_item_variants   enable row level security;
alter table order_item_modifiers  enable row level security;
alter table payments              enable row level security;

-- Helper: get the organization_id of the currently authenticated staff member
create or replace function current_org_id()
returns uuid language sql stable as $$
  select organization_id from staff where id = auth.uid()
$$;

-- Generic policy template for organization-scoped tables:
-- Staff can only see/edit rows belonging to their organization.

-- Example for a table with organization_id column:
create policy "tenant_isolation" on branches
  using (organization_id = current_org_id());

create policy "tenant_isolation" on categories
  using (organization_id = current_org_id());

create policy "tenant_isolation" on products
  using (organization_id = current_org_id());

create policy "tenant_isolation" on modifier_groups
  using (organization_id = current_org_id());

create policy "tenant_isolation" on inventory
  using (organization_id = current_org_id());

create policy "tenant_isolation" on customers
  using (organization_id = current_org_id());

create policy "tenant_isolation" on orders
  using (organization_id = current_org_id());

create policy "staff_own_org" on staff
  using (organization_id = current_org_id());


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-generate sequential order numbers per branch (0001, 0002...)
create or replace function generate_order_number(p_branch_id uuid)
returns text language plpgsql as $$
declare
  next_num int;
begin
  select coalesce(max(order_number::int), 0) + 1
    into next_num
    from orders
   where branch_id = p_branch_id
     and date_trunc('day', created_at) = date_trunc('day', now());  -- resets daily
  return lpad(next_num::text, 4, '0');
end;
$$;

-- Update inventory after a sale (called via trigger or app logic)
create or replace function decrement_inventory()
returns trigger language plpgsql as $$
begin
  update inventory
     set quantity    = quantity - new.quantity,
         updated_at  = now()
   where product_id  = new.product_id
     and branch_id   = (select branch_id from orders where id = new.order_id);
  return new;
end;
$$;

-- Trigger: decrement stock on new order item (only if track_inventory = true)
create trigger on_order_item_insert
  after insert on order_items
  for each row
  execute function decrement_inventory();

-- Auto-update updated_at timestamp
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on organizations   for each row execute function set_updated_at();
create trigger set_updated_at before update on branches        for each row execute function set_updated_at();
create trigger set_updated_at before update on staff           for each row execute function set_updated_at();
create trigger set_updated_at before update on products        for each row execute function set_updated_at();
create trigger set_updated_at before update on categories      for each row execute function set_updated_at();
create trigger set_updated_at before update on orders          for each row execute function set_updated_at();
create trigger set_updated_at before update on customers       for each row execute function set_updated_at();
