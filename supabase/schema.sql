-- Odd Wheels POS - Supabase Schema (Starter)
-- Run this in Supabase SQL Editor.

-- 0) Extensions (optional)
create extension if not exists "pgcrypto";

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'buyer' check (role in ('admin','cashier','buyer')),
  full_name text,
  username text,
  contact_number text,
  email text,
  address text,
  default_address text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_profiles_username_unique on public.profiles (lower(username)) where username is not null;
create unique index if not exists idx_profiles_contact_unique on public.profiles (contact_number) where contact_number is not null;

create unique index if not exists profiles_username_unique on public.profiles(username) where username is not null;
create unique index if not exists profiles_contact_unique on public.profiles(contact_number) where contact_number is not null;

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, username, contact_number, email, address, default_address)
  values (
    new.id,
    'buyer',
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'username', null),
    coalesce(new.raw_user_meta_data->>'contact_number', null),
    coalesce(new.email, null),
    coalesce(new.raw_user_meta_data->>'address', null),
    coalesce(new.raw_user_meta_data->>'address', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 2) Brand tabs
create table if not exists public.brand_tabs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Default brand tabs (editable in Admin)
insert into public.brand_tabs (name, sort_order, is_active)
values
  ('Mini GT', 1, true),
  ('Kaido House', 2, true),
  ('Inno64', 3, true),
  ('Tarmac', 4, true),
  ('POP RACE', 5, true),
  ('BMC', 6, true),
  ('Hot Wheels', 7, true),
  ('Tomica', 8, true),
  ('Focal Horizon', 9, true),
  ('Street Warrior', 10, true),
  ('GCD', 11, true)
on conflict (name) do update set
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- 3) Notices
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4) Settings (singleton row id=1)
create table if not exists public.settings (
  id int primary key,
  shipping_schedule_text text,
  shipping_cutoff_text text,
  priority_shipping_available boolean not null default false,
    priority_shipping_note text,
    pickup_schedule_text text,
    pickup_schedule jsonb not null default '{}'::jsonb,
    pickup_unavailable boolean not null default false,
    header_logo_url text,
    created_at timestamptz not null default now()
  );

insert into public.settings (
  id,
  shipping_schedule_text,
  shipping_cutoff_text,
  priority_shipping_available,
    priority_shipping_note,
    pickup_schedule_text,
    pickup_schedule,
    pickup_unavailable,
    header_logo_url
  )
values (
  1,
  'Set your shipping schedule here.',
  null,
  false,
  'Admin can enable priority shipping anytime.',
  '10:00 AM - 1:00 PM
2:00 PM - 6:00 PM',
  '{
    "MON": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "TUE": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "WED": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "THU": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "FRI": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "SAT": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
    "SUN": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"]
    }'::jsonb,
    false,
    null
  )
on conflict (id) do nothing;

-- 5) Products (identity)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  model text,
  variation text,
  image_urls text[] default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6) Product variants (conditions)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  condition text not null check (condition in ('sealed','unsealed','with_issues')),
  issue_notes text,
  cost numeric,
  price numeric not null,
  qty int not null default 0 check (qty >= 0),
  ship_class text default 'MINI_GT' check (ship_class in ('MINI_GT','KAIDO','POPRACE','ACRYLIC_TRUE_SCALE')),
  created_at timestamptz not null default now()
);

create index if not exists idx_variants_product on public.product_variants(product_id);

-- 7) Cart items
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);

-- 8) Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'PENDING_PAYMENT',
  payment_method text not null default 'GCASH',
  payment_status text not null default 'UNPAID',
  subtotal numeric not null default 0,
  total numeric not null default 0,

  shipping_method text not null,
  shipping_region text,
  shipping_details jsonb not null default '{}'::jsonb,

  shipping_fee numeric not null default 0,
  cop_fee numeric not null default 0,
  lalamove_fee numeric not null default 0,

  priority_requested boolean not null default false,
  priority_fee numeric not null default 0,
  priority_approved boolean not null default false,

  insurance_selected boolean not null default false,
  insurance_fee numeric not null default 0,

  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 9) Order items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_title text,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  condition text not null,
  issue_notes text,
  unit_price numeric not null default 0,
  cost_each numeric,
  qty int not null default 1 check (qty > 0),
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- 10) Audit logs (optional)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ===== RLS Helpers =====
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','cashier'));
$$;

-- ===== Enable RLS =====
alter table public.profiles enable row level security;
alter table public.brand_tabs enable row level security;
alter table public.notices enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_logs enable row level security;

-- ===== Profiles Policies =====
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
for select using (id = auth.uid());

drop policy if exists "staff read profiles" on public.profiles;
-- NOTE: Keeping profile policies simple avoids recursion issues.
-- Staff/admin role management can be done manually in SQL or via service role.

drop policy if exists "user update own profile" on public.profiles;
create policy "user update own profile" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- ===== Brand Tabs Policies =====
drop policy if exists "public read active brand tabs" on public.brand_tabs;
create policy "public read active brand tabs" on public.brand_tabs
for select using (is_active = true);

drop policy if exists "staff read brand tabs" on public.brand_tabs;
create policy "staff read brand tabs" on public.brand_tabs
for select using (public.is_staff());

drop policy if exists "admin manage brand tabs" on public.brand_tabs;
create policy "admin manage brand tabs" on public.brand_tabs
for all using (public.is_admin()) with check (public.is_admin());

-- ===== Notices Policies =====
drop policy if exists "public read active notices" on public.notices;
create policy "public read active notices" on public.notices
for select using (is_active = true and (expires_at is null or expires_at > now()));

drop policy if exists "staff read notices" on public.notices;
create policy "staff read notices" on public.notices
for select using (public.is_staff());

drop policy if exists "admin manage notices" on public.notices;
create policy "admin manage notices" on public.notices
for all using (public.is_admin()) with check (public.is_admin());

-- ===== Settings Policies =====
drop policy if exists "public read settings" on public.settings;
create policy "public read settings" on public.settings
for select using (true);

drop policy if exists "admin update settings" on public.settings;
create policy "admin update settings" on public.settings
for update using (public.is_admin()) with check (public.is_admin());

-- ===== Products Policies =====
drop policy if exists "public read available products" on public.products;
create policy "public read available products" on public.products
for select using (is_active = true);

drop policy if exists "staff read all products" on public.products;
create policy "staff read all products" on public.products
for select using (public.is_staff());

drop policy if exists "staff insert products" on public.products;
create policy "staff insert products" on public.products
for insert with check (public.is_staff());

drop policy if exists "staff update products" on public.products;
create policy "staff update products" on public.products
for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "admin delete products" on public.products;
create policy "admin delete products" on public.products
for delete using (public.is_admin());

-- ===== Variants Policies =====
drop policy if exists "public read in-stock variants" on public.product_variants;
create policy "public read in-stock variants" on public.product_variants
for select using (qty > 0);

drop policy if exists "staff read all variants" on public.product_variants;
create policy "staff read all variants" on public.product_variants
for select using (public.is_staff());

drop policy if exists "staff manage variants" on public.product_variants;
create policy "staff manage variants" on public.product_variants
for all using (public.is_staff()) with check (public.is_staff());

-- ===== Cart Policies =====
drop policy if exists "user manage own cart" on public.cart_items;
create policy "user manage own cart" on public.cart_items
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admin read cart items" on public.cart_items;
create policy "admin read cart items" on public.cart_items
for select using (public.is_admin());

-- ===== Orders Policies =====
drop policy if exists "user insert own orders" on public.orders;
create policy "user insert own orders" on public.orders
for insert with check (user_id = auth.uid());

drop policy if exists "user read own orders" on public.orders;
create policy "user read own orders" on public.orders
for select using (user_id = auth.uid());

drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
for select using (public.is_staff());

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders
for update using (public.is_staff()) with check (public.is_staff());

-- ===== Order Items Policies =====
drop policy if exists "user insert own order items" on public.order_items;
create policy "user insert own order items" on public.order_items
for insert with check (
  exists(select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
);

drop policy if exists "user read own order items" on public.order_items;
create policy "user read own order items" on public.order_items
for select using (
  exists(select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
);

drop policy if exists "staff read order items" on public.order_items;
create policy "staff read order items" on public.order_items
for select using (public.is_staff());

drop policy if exists "staff update order items" on public.order_items;
create policy "staff update order items" on public.order_items
for update using (public.is_staff()) with check (public.is_staff());

-- ===== Audit Logs Policies =====
drop policy if exists "staff read audit logs" on public.audit_logs;
create policy "staff read audit logs" on public.audit_logs
for select using (public.is_staff());

drop policy if exists "staff insert audit logs" on public.audit_logs;
create policy "staff insert audit logs" on public.audit_logs
for insert with check (public.is_staff());

-- ===== Order item cost snapshot =====
create or replace function public.fn_set_order_item_cost_each()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cost_each is null then
    select pv.cost into new.cost_each
    from public.product_variants pv
    where pv.id = new.variant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_items_cost_each on public.order_items;
create trigger trg_order_items_cost_each
before insert on public.order_items
for each row execute procedure public.fn_set_order_item_cost_each();
-- ===== Atomic inventory deduction on successful payment =====
create or replace function public.fn_process_paid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.payment_status = 'PAID' then
    return jsonb_build_object('ok', true, 'already_processed', true, 'order_id', p_order_id);
  end if;

  update public.order_items oi
    set cost_each = pv.cost
  from public.product_variants pv
  where oi.order_id = p_order_id
    and oi.variant_id = pv.id
    and oi.cost_each is null;

  -- Deduct inventory per variant (atomic). Prevent negative stock.
  for v_item in
    select variant_id, qty from public.order_items where order_id = p_order_id
  loop
    update public.product_variants
      set qty = qty - v_item.qty
    where id = v_item.variant_id
      and qty >= v_item.qty;

    if not found then
      raise exception 'Insufficient stock for variant %', v_item.variant_id;
    end if;
  end loop;

  update public.orders
    set payment_status = 'PAID',
        status = 'PAID',
        paid_at = now()
  where id = p_order_id;

  insert into public.audit_logs(actor_user_id, action, meta)
  values (auth.uid(), 'ORDER_PAID_AUTO', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

-- IMPORTANT: Ensure the function owner has privileges to bypass RLS (service role) when called from webhook.
-- In practice, call this function using SUPABASE_SERVICE_ROLE_KEY from the server webhook route.

-- ===== Storage (manual step) =====
-- Create a public bucket named: product-images
-- Then set policies to allow staff uploads and public reads (or signed URLs).

-- Lock down the RPC so only the service role (server/webhook) can call it.
revoke execute on function public.fn_process_paid_order(uuid) from public;
grant execute on function public.fn_process_paid_order(uuid) to service_role;




