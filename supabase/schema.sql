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
declare
  v_insert_columns text[] := array['id'];
  v_insert_values text[];
  v_update_columns text[] := array[]::text[];
  v_column text;
  v_value text;
  v_user_id uuid;
  v_user_email text;
  v_user_meta jsonb;
begin
  v_user_id := new.id;
  v_user_email := nullif(trim(coalesce(new.email, '')), '');
  v_user_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_insert_values := array[format('%L', v_user_id)];

  for v_column, v_value in
    select
      c.column_name,
      case c.column_name
        when 'role' then 'buyer'
        when 'full_name' then nullif(trim(coalesce(v_user_meta->>'full_name', '')), '')
        when 'username' then nullif(trim(coalesce(v_user_meta->>'username', '')), '')
        when 'contact_number' then nullif(trim(coalesce(v_user_meta->>'contact_number', '')), '')
        when 'email' then v_user_email
        when 'address' then nullif(trim(coalesce(v_user_meta->>'address', '')), '')
        when 'default_address' then nullif(trim(coalesce(v_user_meta->>'address', '')), '')
        when 'contact_country_code' then nullif(trim(coalesce(v_user_meta->>'contact_country_code', '')), '')
        when 'contact_country_iso2' then nullif(trim(coalesce(v_user_meta->>'contact_country_iso2', '')), '')
        else null
      end
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = any(
        array[
          'role',
          'full_name',
          'username',
          'contact_number',
          'email',
          'address',
          'default_address',
          'contact_country_code',
          'contact_country_iso2'
        ]
      )
    order by c.ordinal_position
  loop
    v_insert_columns := array_append(v_insert_columns, v_column);
    v_insert_values := array_append(
      v_insert_values,
      case
        when v_value is null then 'null'
        else format('%L', v_value)
      end
    );
    if v_column <> 'role' then
      v_update_columns := array_append(v_update_columns, v_column);
    end if;
  end loop;

  if coalesce(array_length(v_update_columns, 1), 0) > 0 then
    execute format(
      'insert into public.profiles (%s) values (%s) on conflict (id) do update set %s',
      array_to_string(
        array(select format('%I', col) from unnest(v_insert_columns) as col),
        ', '
      ),
      array_to_string(v_insert_values, ', '),
      array_to_string(
        array(
          select format(
            '%1$I = coalesce(excluded.%1$I, public.profiles.%1$I)',
            col
          )
          from unnest(v_update_columns) as col
        ),
        ', '
      )
    );
  else
    execute format(
      'insert into public.profiles (%s) values (%s) on conflict (id) do nothing',
      array_to_string(
        array(select format('%I', col) from unnest(v_insert_columns) as col),
        ', '
      ),
      array_to_string(v_insert_values, ', ')
    );
  end if;

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
  ('Tomica Limited Vintage Neo', 9, true),
  ('Focal Horizon', 10, true),
  ('Street Warrior', 11, true),
  ('GCD', 12, true)
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

-- 3b) Announcements
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text,
  body text not null,
  image_urls text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_created_at
  on public.announcements (created_at desc);

-- 4) Settings (singleton row id=1)
create table if not exists public.settings (
  id int primary key,
  shipping_schedule_text text,
  shipping_cutoff_text text,
  order_approval_enabled boolean not null default true,
    show_prices boolean not null default true,
    allow_add_to_cart boolean not null default true,
    allow_checkout boolean not null default true,
    priority_shipping_available boolean not null default false,
    priority_shipping_note text,
    free_shipping_threshold numeric not null default 0,
    free_shipping_couriers text[],
    free_shipping_ship_classes text[],
    allowed_couriers text[],
    allowed_lbc_packages text[],
    allowed_jnt_pouches text[],
    pickup_schedule_text text,
    pickup_schedule jsonb not null default '{}'::jsonb,
    pickup_unavailable boolean not null default false,
    header_logo_url text,
    protector_stock_mainline int not null default 0,
    protector_stock_premium int not null default 0,
    protector_stock int not null default 0,
    created_at timestamptz not null default now()
  );

insert into public.settings (
  id,
  shipping_schedule_text,
  shipping_cutoff_text,
  order_approval_enabled,
  show_prices,
  allow_add_to_cart,
  allow_checkout,
  priority_shipping_available,
    priority_shipping_note,
    free_shipping_threshold,
    free_shipping_couriers,
    free_shipping_ship_classes,
    allowed_couriers,
    allowed_lbc_packages,
    allowed_jnt_pouches,
    pickup_schedule_text,
    pickup_schedule,
    pickup_unavailable,
    header_logo_url,
    protector_stock_mainline,
    protector_stock_premium,
    protector_stock
  )
values (
  1,
  'Set your shipping schedule here.',
  null,
  true,
  true,
  true,
  true,
  false,
  'Admin can enable priority shipping anytime.',
  0,
  null,
  null,
  null,
  null,
  null,
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
    null,
    0,
    0,
    0
  )
on conflict (id) do nothing;

-- 5) Products (identity)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  model text,
  variation text,
  special_tags text[] not null default '{}'::text[]
    check (special_tags <@ array['exclusive','limited_edition','chase','rare','new_release','discontinued']::text[]),
  image_urls text[] default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6) Product variants (conditions)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  condition text not null check (condition in ('sealed','resealed','near_mint','sealed_near_mint_box','sealed_near_mint_blister','sealed_not_mint_box','sealed_not_mint_blister','unsealed','unsealed_no_box','unsealed_no_acrylic','unsealed_near_mint_box','unsealed_near_mint_blister','wheelswapped','customized','with_issues','blistered','sealed_blister','unsealed_blister')),
  issue_notes text,
  cost numeric,
  price numeric not null,
  sale_price numeric,
  discount_percent numeric,
  qty int not null default 0 check (qty >= 0),
  release_at timestamptz,
  ship_class text default 'MINI_GT' check (ship_class in ('MINI_GT','SMALL_BOX_FIGURE','KAIDO','POPRACE','ACRYLIC_TRUE_SCALE','TRUCKS','BLISTER','TOMICA','TOMICA_LIMITED_VINTAGE_NEO','HOT_WHEELS_MAINLINE','HOT_WHEELS_PREMIUM','LOOSE_NO_BOX','LALAMOVE','FIGURES_DIORAMA')),
  allowed_couriers text[],
  allowed_lbc_packages text[],
  allowed_jnt_pouches text[],
  created_at timestamptz not null default now(),
  first_stocked_at timestamptz,
  in_stock_since timestamptz,
  last_stock_added_at timestamptz,
  last_qty_changed_at timestamptz,
  stale_reviewed_at timestamptz
);

create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_product_variants_release_at
  on public.product_variants (release_at);

alter table public.product_variants
  drop constraint if exists product_variants_ship_class_check;

alter table public.product_variants
  add constraint product_variants_ship_class_check
  check (
    ship_class in (
      'MINI_GT',
      'SMALL_BOX_FIGURE',
      'KAIDO',
      'POPRACE',
      'ACRYLIC_TRUE_SCALE',
      'TRUCKS',
      'BLISTER',
      'TOMICA',
      'TOMICA_LIMITED_VINTAGE_NEO',
      'HOT_WHEELS_MAINLINE',
      'HOT_WHEELS_PREMIUM',
      'LOOSE_NO_BOX',
      'LALAMOVE',
      'FIGURES_DIORAMA'
    )
  );

-- Refresh condition constraint for existing projects when new condition values are added.
alter table public.product_variants
  drop constraint if exists product_variants_condition_check;

alter table public.product_variants
  add constraint product_variants_condition_check
  check (
    condition in (
      'sealed',
      'resealed',
      'near_mint',
      'sealed_near_mint_box',
      'sealed_near_mint_blister',
      'sealed_not_mint_box',
      'sealed_not_mint_blister',
      'unsealed',
      'unsealed_no_box',
      'unsealed_no_acrylic',
      'unsealed_near_mint_box',
      'unsealed_near_mint_blister',
      'wheelswapped',
      'customized',
      'with_issues',
      'blistered',
      'sealed_blister',
      'unsealed_blister'
    )
  );

alter table public.product_variants
  add column if not exists release_at timestamptz,
  add column if not exists first_stocked_at timestamptz,
  add column if not exists in_stock_since timestamptz,
  add column if not exists last_stock_added_at timestamptz,
  add column if not exists last_qty_changed_at timestamptz,
  add column if not exists stale_reviewed_at timestamptz;

-- 7) Cart items
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  protector_selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);

-- 8) Sales customers
create table if not exists public.sales_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  phone text,
  normalized_phone text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count int not null default 0,
  total_spend numeric not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sales_customers_normalized_name_unique
  on public.sales_customers (normalized_name);

create index if not exists idx_sales_customers_last_order_at
  on public.sales_customers (last_order_at desc);

-- 9) Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  sales_customer_id uuid references public.sales_customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  contact text,
  address text,
  status text not null default 'AWAITING_PAYMENT',
  order_status text not null default 'AWAITING_PAYMENT',
  channel text not null default 'WEB',
  payment_method text not null default 'GCASH',
  payment_status text not null default 'UNPAID',
  fulfillment_status text not null default 'PENDING',
  carrier text not null default 'PICKUP',
  courier text,
  subtotal numeric not null default 0,
  total numeric not null default 0,

  shipping_method text not null,
  shipping_region text,
  shipping_details jsonb not null default '{}'::jsonb,
  shipping_status text not null default 'PREPARING TO SHIP',
  tracking_number text,

  shipping_fee numeric not null default 0,
  cop_fee numeric not null default 0,
  lalamove_fee numeric not null default 0,
  discount numeric not null default 0,
  shipping_discount numeric not null default 0,
  discount_total numeric not null default 0,
  priority_level text not null default 'NORMAL',

  priority_requested boolean not null default false,
  priority_fee numeric not null default 0,
  priority_approved boolean not null default false,

  insurance_selected boolean not null default false,
  insurance_fee numeric not null default 0,

  expires_at timestamptz,
  expired_at timestamptz,
  cancelled_reason text,
  inventory_deducted boolean not null default false,
  reserved_expires_at timestamptz,
  payment_deadline timestamptz,
  payment_hold boolean not null default false,
  shipped_at timestamptz,
  completed_at timestamptz,
  receipt_url text,

  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 10) Order items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  item_id uuid,
  item_name text,
  product_title text,
  image_url text,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  condition text not null,
  issue_notes text,
  unit_price numeric not null default 0,
  price_each numeric,
  cost_each numeric,
  qty int not null default 1 check (qty > 0),
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_orders_sales_customer
  on public.orders (sales_customer_id, created_at desc);

alter table public.orders
  add column if not exists fulfillment_status text not null default 'PENDING';

alter table public.orders
  alter column fulfillment_status set default 'PENDING';

update public.orders
  set fulfillment_status = 'PENDING'
where fulfillment_status is null;

alter table public.orders
  alter column fulfillment_status set not null;

alter table public.orders
  add column if not exists order_status text not null default 'AWAITING_PAYMENT',
  add column if not exists channel text not null default 'WEB',
  add column if not exists carrier text not null default 'PICKUP',
  add column if not exists courier text,
  add column if not exists shipping_status text not null default 'PREPARING TO SHIP',
  add column if not exists tracking_number text,
  add column if not exists discount numeric not null default 0,
  add column if not exists shipping_discount numeric not null default 0,
  add column if not exists discount_total numeric not null default 0,
  add column if not exists priority_level text not null default 'NORMAL',
  add column if not exists inventory_deducted boolean not null default false,
  add column if not exists payment_hold boolean not null default false,
  add column if not exists shipped_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists receipt_url text;

alter table public.orders
  alter column status set default 'AWAITING_PAYMENT',
  alter column order_status set default 'AWAITING_PAYMENT',
  alter column channel set default 'WEB',
  alter column carrier set default 'PICKUP',
  alter column shipping_status set default 'PREPARING TO SHIP',
  alter column discount set default 0,
  alter column shipping_discount set default 0,
  alter column discount_total set default 0,
  alter column priority_level set default 'NORMAL',
  alter column inventory_deducted set default false,
  alter column payment_hold set default false;

update public.orders
  set order_status = coalesce(order_status, status, 'AWAITING_PAYMENT'),
      channel = coalesce(nullif(trim(channel), ''), 'WEB'),
      carrier = coalesce(nullif(trim(carrier), ''), nullif(trim(courier), ''), nullif(trim(shipping_method), ''), 'PICKUP'),
      shipping_status = coalesce(nullif(trim(shipping_status), ''), 'PREPARING TO SHIP'),
      discount = coalesce(discount, 0),
      shipping_discount = coalesce(shipping_discount, 0),
      discount_total = coalesce(discount_total, 0),
      priority_level = coalesce(nullif(trim(priority_level), ''), 'NORMAL'),
      inventory_deducted = coalesce(inventory_deducted, false),
      payment_hold = coalesce(payment_hold, false)
where order_status is null
   or channel is null
   or nullif(trim(channel), '') is null
   or carrier is null
   or nullif(trim(carrier), '') is null
   or shipping_status is null
   or nullif(trim(shipping_status), '') is null
   or discount is null
   or shipping_discount is null
   or discount_total is null
   or priority_level is null
   or nullif(trim(priority_level), '') is null
   or inventory_deducted is null
   or payment_hold is null;

alter table public.orders
  alter column order_status set not null,
  alter column channel set not null,
  alter column carrier set not null,
  alter column shipping_status set not null,
  alter column discount set not null,
  alter column shipping_discount set not null,
  alter column discount_total set not null,
  alter column priority_level set not null,
  alter column inventory_deducted set not null,
  alter column payment_hold set not null;

-- 10) Audit logs (optional)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 11) Bug reports
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  message text not null,
  page_url text,
  user_agent text,
  status text not null default 'NEW' check (status in ('NEW','RESOLVED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_bug_reports_status
  on public.bug_reports (status, created_at desc);

-- 11) Bug reports
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  page_url text,
  user_agent text,
  message text not null,
  status text not null default 'NEW'
);

-- ===== RLS Helpers =====
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','cashier'));
$$;

-- ===== Enable RLS =====
alter table public.profiles enable row level security;
alter table public.brand_tabs enable row level security;
alter table public.notices enable row level security;
alter table public.announcements enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.cart_items enable row level security;
alter table public.sales_customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.bug_reports enable row level security;
alter table public.bug_reports enable row level security;

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

-- ===== Announcements Policies =====
drop policy if exists "public read active announcements" on public.announcements;
create policy "public read active announcements" on public.announcements
for select using (is_active = true);

drop policy if exists "staff read announcements" on public.announcements;
create policy "staff read announcements" on public.announcements
for select using (public.is_staff());

drop policy if exists "admin manage announcements" on public.announcements;
create policy "admin manage announcements" on public.announcements
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
for select using (
  is_active = true
  and exists (
    select 1
    from public.product_variants pv
    where pv.product_id = products.id
      and pv.qty > 0
      and (pv.release_at is null or pv.release_at <= now())
  )
);

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
for select using (qty > 0 and (release_at is null or release_at <= now()));

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

alter table public.orders
  add column if not exists sales_customer_id uuid references public.sales_customers(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists contact text,
  add column if not exists address text;

alter table public.sales_customers enable row level security;

drop policy if exists "staff read sales customers" on public.sales_customers;
create policy "staff read sales customers" on public.sales_customers
for select using (public.is_staff());

drop policy if exists "staff manage sales customers" on public.sales_customers;
create policy "staff manage sales customers" on public.sales_customers
for all using (public.is_staff()) with check (public.is_staff());

create or replace function public.normalize_sales_customer_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(lower(trim(coalesce(p_name, ''))), '\s+', ' ', 'g'),
    ''
  );
$$;

create or replace function public.normalize_sales_customer_phone(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '');
$$;

create or replace function public.fn_touch_sales_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sales_customers_updated_at on public.sales_customers;
create trigger trg_sales_customers_updated_at
before update on public.sales_customers
for each row execute procedure public.fn_touch_sales_customers_updated_at();

create or replace function public.fn_upsert_sales_customer(
  p_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_normalized_name text;
  v_normalized_phone text;
  v_customer_id uuid;
begin
  v_normalized_name := public.normalize_sales_customer_name(v_name);
  if v_normalized_name is null then
    raise exception 'Customer name required.';
  end if;

  v_normalized_phone := public.normalize_sales_customer_phone(v_phone);

  insert into public.sales_customers (
    name,
    normalized_name,
    phone,
    normalized_phone,
    created_by_user_id
  )
  values (
    v_name,
    v_normalized_name,
    case when v_normalized_phone is null then null else v_phone end,
    v_normalized_phone,
    auth.uid()
  )
  on conflict (normalized_name) do update set
    name = excluded.name,
    phone = case
      when excluded.normalized_phone is not null then excluded.phone
      else public.sales_customers.phone
    end,
    normalized_phone = coalesce(
      excluded.normalized_phone,
      public.sales_customers.normalized_phone
    ),
    updated_at = now()
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

create or replace function public.fn_refresh_sales_customer_stats(p_sales_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_sales_customer_id is null then
    return;
  end if;

  update public.sales_customers sc
    set first_order_at = stats.first_order_at,
        last_order_at = stats.last_order_at,
        order_count = stats.order_count,
        total_spend = stats.total_spend,
        updated_at = now()
  from (
    select
      min(coalesce(o.paid_at, o.created_at)) as first_order_at,
      max(coalesce(o.paid_at, o.created_at)) as last_order_at,
      count(*)::int as order_count,
      coalesce(sum(o.total), 0) as total_spend
    from public.orders o
    where o.sales_customer_id = p_sales_customer_id
      and (coalesce(o.payment_status, '') = 'PAID' or upper(coalesce(o.channel, '')) = 'POS')
      and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
  ) stats
  where sc.id = p_sales_customer_id;
end;
$$;

create or replace function public.fn_suggest_sales_customers(
  p_query text default null,
  p_limit integer default 8
)
returns table(
  id uuid,
  name text,
  phone text,
  order_count int,
  total_spend numeric,
  last_order_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_query text := public.normalize_sales_customer_name(p_query);
  v_limit integer := greatest(coalesce(p_limit, 8), 1);
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    sc.id,
    sc.name,
    sc.phone,
    sc.order_count,
    sc.total_spend,
    sc.last_order_at
  from public.sales_customers sc
  where v_query is null
     or sc.normalized_name like v_query || '%'
     or sc.normalized_name like '%' || v_query || '%'
  order by
    case
      when v_query is null then 0
      when sc.normalized_name = v_query then 0
      when sc.normalized_name like v_query || '%' then 1
      else 2
    end,
    sc.last_order_at desc nulls last,
    sc.order_count desc,
    sc.name asc
  limit v_limit;
end;
$$;

revoke execute on function public.fn_upsert_sales_customer(text, text) from public;
revoke execute on function public.fn_refresh_sales_customer_stats(uuid) from public;
revoke execute on function public.fn_suggest_sales_customers(text, integer) from public;
grant execute on function public.fn_suggest_sales_customers(text, integer) to authenticated;

create or replace function public.fn_prepare_order_customer_record()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_details jsonb := coalesce(new.shipping_details, '{}'::jsonb);
  v_channel text := upper(trim(coalesce(new.channel, 'WEB')));
  v_customer_name text;
  v_customer_phone text;
  v_customer_address text;
  v_skip_sales_customer boolean := lower(trim(coalesce(v_details->>'skip_sales_customer', 'false'))) = 'true';
begin
  v_customer_name := nullif(
    trim(
      coalesce(
        new.customer_name,
        v_details->>'receiver_name',
        v_details->>'name',
        ''
      )
    ),
    ''
  );
  v_customer_phone := nullif(
    trim(
      coalesce(
        new.customer_phone,
        new.contact,
        v_details->>'receiver_phone',
        v_details->>'phone',
        v_details->>'contact',
        ''
      )
    ),
    ''
  );
  v_customer_address := nullif(
    trim(
      coalesce(
        new.address,
        v_details->>'full_address',
        v_details->>'address',
        v_details->>'dropoff_address',
        v_details->>'pickup_location',
        ''
      )
    ),
    ''
  );

  if v_customer_name is not null then
    new.customer_name := v_customer_name;
    if nullif(trim(coalesce(v_details->>'receiver_name', '')), '') is null then
      v_details := jsonb_set(v_details, '{receiver_name}', to_jsonb(v_customer_name), true);
    end if;
  end if;

  if v_customer_phone is not null then
    new.customer_phone := v_customer_phone;
    new.contact := coalesce(nullif(trim(coalesce(new.contact, '')), ''), v_customer_phone);
    if nullif(trim(coalesce(v_details->>'receiver_phone', '')), '') is null then
      v_details := jsonb_set(v_details, '{receiver_phone}', to_jsonb(v_customer_phone), true);
    end if;
    if nullif(trim(coalesce(v_details->>'phone', '')), '') is null then
      v_details := jsonb_set(v_details, '{phone}', to_jsonb(v_customer_phone), true);
    end if;
  end if;

  if v_customer_address is not null then
    new.address := v_customer_address;
    if nullif(trim(coalesce(v_details->>'full_address', v_details->>'address', '')), '') is null then
      v_details := jsonb_set(v_details, '{address}', to_jsonb(v_customer_address), true);
    end if;
  end if;

  new.shipping_details := v_details;

  if v_channel = 'POS' and not v_skip_sales_customer and v_customer_name is not null then
    if tg_op = 'INSERT' then
      if new.sales_customer_id is null then
        new.sales_customer_id := public.fn_upsert_sales_customer(v_customer_name, v_customer_phone);
      end if;
    elsif new.sales_customer_id is null
       or old.customer_name is distinct from new.customer_name
       or old.customer_phone is distinct from new.customer_phone then
      new.sales_customer_id := public.fn_upsert_sales_customer(v_customer_name, v_customer_phone);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_prepare_customer_record on public.orders;
create trigger trg_orders_prepare_customer_record
before insert or update of sales_customer_id, customer_name, customer_phone, contact, address, shipping_details, channel
on public.orders
for each row execute procedure public.fn_prepare_order_customer_record();

create or replace function public.fn_refresh_sales_customer_stats_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old_customer_id uuid := null;
begin
  if tg_op = 'UPDATE' then
    v_old_customer_id := old.sales_customer_id;
  end if;

  if v_old_customer_id is not null and v_old_customer_id is distinct from new.sales_customer_id then
    perform public.fn_refresh_sales_customer_stats(v_old_customer_id);
  end if;

  if new.sales_customer_id is not null then
    perform public.fn_refresh_sales_customer_stats(new.sales_customer_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_refresh_sales_customer_stats on public.orders;
create trigger trg_orders_refresh_sales_customer_stats
after insert or update of sales_customer_id, payment_status, status, total, paid_at, created_at, channel
on public.orders
for each row execute procedure public.fn_refresh_sales_customer_stats_from_order();

drop function if exists public.pos_create_order(text, text, text, jsonb, text, boolean, jsonb);
create or replace function public.pos_create_order(
  p_customer_name text,
  p_customer_phone text default null,
  p_shipping_method text default 'PICKUP',
  p_shipping_details jsonb default '{}'::jsonb,
  p_payment_method text default 'CASH',
  p_save_customer boolean default true,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_customer_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_customer_phone text := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_shipping_method text := upper(trim(coalesce(p_shipping_method, 'PICKUP')));
  v_carrier text;
  v_payment_method text := upper(trim(coalesce(p_payment_method, 'CASH')));
  v_shipping_details jsonb := coalesce(p_shipping_details, '{}'::jsonb);
  v_sales_customer_id uuid := null;
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_product_id uuid;
  v_condition text;
  v_issue_notes text;
  v_price numeric;
  v_sale_price numeric;
  v_discount_percent numeric;
  v_product_title text;
  v_image_url text;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_remaining integer;
  v_sold_out uuid[] := '{}';
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if v_actor_user_id is null then
    raise exception 'Staff session required.';
  end if;

  if v_customer_name is null then
    raise exception 'Customer name required.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one POS item is required.';
  end if;

  v_shipping_details := v_shipping_details || jsonb_build_object(
    'receiver_name', v_customer_name,
    'source', coalesce(nullif(trim(coalesce(v_shipping_details->>'source', '')), ''), 'pos_checkout')
  );

  if v_customer_phone is not null then
    v_shipping_details := v_shipping_details || jsonb_build_object(
      'receiver_phone', v_customer_phone,
      'phone', v_customer_phone
    );
  end if;

  if not coalesce(p_save_customer, true) then
    v_shipping_details := v_shipping_details || jsonb_build_object('skip_sales_customer', true);
  else
    v_sales_customer_id := public.fn_upsert_sales_customer(v_customer_name, v_customer_phone);
  end if;

  v_carrier := case
    when v_shipping_method in ('JNT', 'J&T', 'J&T EXPRESS', 'J&TEXPRESS', 'JT') then 'JNT'
    when v_shipping_method in ('LBC', 'LALAMOVE', 'PICKUP', 'INTERNATIONAL') then v_shipping_method
    else 'OTHER'
  end;

  insert into public.orders (
    id,
    user_id,
    sales_customer_id,
    customer_name,
    customer_phone,
    contact,
    address,
    status,
    order_status,
    payment_method,
    payment_status,
    fulfillment_status,
    carrier,
    courier,
    subtotal,
    total,
    shipping_method,
    shipping_region,
    shipping_details,
    shipping_status,
    shipping_fee,
    cop_fee,
    lalamove_fee,
    discount,
    shipping_discount,
    discount_total,
    priority_level,
    priority_requested,
    priority_fee,
    priority_approved,
    insurance_selected,
    insurance_fee,
    payment_hold,
    inventory_deducted,
    channel
  )
  values (
    v_order_id,
    v_actor_user_id,
    v_sales_customer_id,
    v_customer_name,
    v_customer_phone,
    v_customer_phone,
    nullif(trim(coalesce(v_shipping_details->>'full_address', v_shipping_details->>'address', v_shipping_details->>'dropoff_address', '')), ''),
    'AWAITING_PAYMENT',
    'AWAITING_PAYMENT',
    v_payment_method,
    'UNPAID',
    'PENDING',
    v_carrier,
    v_carrier,
    0,
    0,
    v_shipping_method,
    null,
    v_shipping_details,
    'PREPARING TO SHIP',
    0,
    0,
    0,
    0,
    0,
    0,
    'NORMAL',
    false,
    0,
    false,
    false,
    0,
    false,
    true,
    'POS'
  );

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    v_qty := greatest(coalesce((v_item->>'qty')::integer, 0), 0);

    if v_variant_id is null or v_qty <= 0 then
      raise exception 'Invalid POS item payload.';
    end if;

    select
      pv.product_id,
      pv.condition,
      pv.issue_notes,
      pv.price,
      pv.sale_price,
      pv.discount_percent,
      p.title,
      p.image_urls[1]
    into
      v_product_id,
      v_condition,
      v_issue_notes,
      v_price,
      v_sale_price,
      v_discount_percent,
      v_product_title,
      v_image_url
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id
    for update;

    if v_product_id is null then
      raise exception 'Variant not found: %', v_variant_id;
    end if;

    v_unit_price := coalesce(
      v_sale_price,
      case
        when coalesce(v_discount_percent, 0) > 0
          then round(v_price * ((100 - least(greatest(v_discount_percent, 0), 100)) / 100.0), 2)
        else v_price
      end,
      v_price,
      0
    );

    update public.product_variants
      set qty = qty - v_qty
    where id = v_variant_id
      and qty >= v_qty
    returning qty into v_remaining;

    if not found then
      raise exception 'Insufficient stock for variant %', v_variant_id;
    end if;

    if v_remaining <= 0 then
      v_sold_out := array_append(v_sold_out, v_variant_id);
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      item_id,
      item_name,
      product_title,
      image_url,
      variant_id,
      condition,
      issue_notes,
      unit_price,
      price_each,
      cost_each,
      qty,
      line_total
    )
    values (
      v_order_id,
      v_product_id,
      v_variant_id,
      v_product_title,
      v_product_title,
      v_image_url,
      v_variant_id,
      coalesce(v_condition, 'sealed'),
      v_issue_notes,
      v_unit_price,
      v_unit_price,
      null,
      v_qty,
      v_unit_price * v_qty
    );

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  end loop;

  update public.orders
    set subtotal = v_subtotal,
        total = v_subtotal
  where id = v_order_id;

  if array_length(v_sold_out, 1) is not null then
    perform public.fn_cleanup_sold_out_variants(v_sold_out);
  end if;

  insert into public.audit_logs (actor_user_id, action, meta)
  values (
    v_actor_user_id,
    'POS_ORDER_CREATED',
    jsonb_build_object(
      'order_id', v_order_id,
      'sales_customer_id', v_sales_customer_id,
      'item_count', jsonb_array_length(p_items)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'sales_customer_id', v_sales_customer_id
  );
end;
$$;

revoke execute on function public.pos_create_order(text, text, text, jsonb, text, boolean, jsonb) from public;
grant execute on function public.pos_create_order(text, text, text, jsonb, text, boolean, jsonb) to authenticated;

-- ===== Payment Methods =====
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  method text unique not null,
  label text not null,
  account_number text,
  account_name text,
  instructions text,
  qr_image_url text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.fn_touch_payment_methods_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_methods_updated_at on public.payment_methods;
create trigger trg_payment_methods_updated_at
before update on public.payment_methods
for each row execute procedure public.fn_touch_payment_methods_updated_at();

alter table public.payment_methods enable row level security;

drop policy if exists "auth read active payment methods" on public.payment_methods;
create policy "auth read active payment methods" on public.payment_methods
for select using (auth.uid() is not null and is_active = true);

drop policy if exists "staff manage payment methods" on public.payment_methods;
create policy "staff manage payment methods" on public.payment_methods
for all using (public.is_staff()) with check (public.is_staff());

insert into public.payment_methods (method, label, account_number, account_name, instructions, is_active)
values
  ('GCASH', 'GCash', '09276524063', 'Dylan Carlo C.', null, true),
  ('BPI', 'BPI', '2269290903', 'Dylan Cruz', null, true)
on conflict (method) do update set
  label = excluded.label,
  account_number = excluded.account_number,
  account_name = excluded.account_name,
  is_active = excluded.is_active;

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

-- ===== Bug Reports Policies =====
drop policy if exists "admin read bug reports" on public.bug_reports;
create policy "admin read bug reports" on public.bug_reports
for select using (public.is_admin());

drop policy if exists "admin manage bug reports" on public.bug_reports;
create policy "admin manage bug reports" on public.bug_reports
for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.fn_report_bug(
  p_message text,
  p_page_url text default null,
  p_user_email text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'Bug report message is required.';
  end if;

  insert into public.bug_reports (user_id, user_email, message, page_url, user_agent)
  values (auth.uid(), nullif(trim(coalesce(p_user_email, '')), ''), trim(p_message), p_page_url, p_user_agent);

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.fn_report_bug(text, text, text, text) from public;
grant execute on function public.fn_report_bug(text, text, text, text) to anon, authenticated;

-- ===== Bug Reports Policies =====
drop policy if exists "admin read bug reports" on public.bug_reports;
create policy "admin read bug reports" on public.bug_reports
for select using (public.is_admin());

drop policy if exists "admin update bug reports" on public.bug_reports;
create policy "admin update bug reports" on public.bug_reports
for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.fn_report_bug(
  p_message text,
  p_page_url text default null,
  p_user_email text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Bug report message required.';
  end if;

  insert into public.bug_reports (user_id, user_email, page_url, user_agent, message)
  values (
    auth.uid(),
    nullif(trim(p_user_email), ''),
    nullif(trim(p_page_url), ''),
    nullif(trim(p_user_agent), ''),
    trim(p_message)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.fn_report_bug(text, text, text, text) from public;
grant execute on function public.fn_report_bug(text, text, text, text) to anon, authenticated;

-- ===== Order item cost snapshot =====
create or replace function public.fn_set_order_item_cost_each()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant_id uuid;
begin
  v_variant_id := new.variant_id;

  if new.cost_each is null then
    select pv.cost into new.cost_each
    from public.product_variants pv
    where pv.id = v_variant_id;
  end if;
  return new;
end;
$$;

create or replace function public.fn_set_order_item_image_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_img text;
  v_product_id uuid;
  v_variant_id uuid;
begin
  v_product_id := new.product_id;
  v_variant_id := new.variant_id;

  if new.image_url is not null and length(trim(new.image_url)) > 0 then
    return new;
  end if;

  if v_product_id is not null then
    select p.image_urls[1]
      into v_img
    from public.products p
    where p.id = v_product_id;
  end if;

  if (v_img is null or length(trim(coalesce(v_img, ''))) = 0) and v_variant_id is not null then
    select p.image_urls[1]
      into v_img
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id;
  end if;

  if v_img is not null and length(trim(v_img)) > 0 then
    new.image_url = v_img;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_items_cost_each on public.order_items;
create trigger trg_order_items_cost_each
before insert on public.order_items
for each row execute procedure public.fn_set_order_item_cost_each();

drop trigger if exists trg_order_items_image_url on public.order_items;
create trigger trg_order_items_image_url
before insert on public.order_items
for each row execute procedure public.fn_set_order_item_image_url();
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
  v_item_variant_id uuid;
  v_item_qty integer;
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
    v_item_variant_id := v_item.variant_id;
    v_item_qty := v_item.qty;

    update public.product_variants
      set qty = qty - v_item_qty
    where id = v_item_variant_id
      and qty >= v_item_qty;

    if not found then
      raise exception 'Insufficient stock for variant %', v_item_variant_id;
    end if;
  end loop;

  update public.orders
    set payment_status = 'PAID',
        status = 'PAID',
        order_status = 'PAID',
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

create table if not exists public.product_clicks (
  product_id uuid primary key references public.products(id) on delete cascade,
  clicks integer not null default 0,
  last_clicked_at timestamptz not null default now()
);

alter table public.product_clicks enable row level security;

drop policy if exists "product clicks read" on public.product_clicks;
create policy "product clicks read" on public.product_clicks
for select using (true);

create or replace function public.increment_product_click(p_product_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.product_clicks (product_id, clicks, last_clicked_at)
  values (p_product_id, 1, now())
  on conflict (product_id)
  do update set
    clicks = public.product_clicks.clicks + 1,
    last_clicked_at = now();
end;
$$;

grant execute on function public.increment_product_click(uuid) to anon, authenticated;

create table if not exists public.product_add_to_cart (
  product_id uuid primary key references public.products(id) on delete cascade,
  adds integer not null default 0,
  last_added_at timestamptz not null default now()
);

alter table public.product_add_to_cart enable row level security;

drop policy if exists "product add to cart read" on public.product_add_to_cart;
create policy "product add to cart read" on public.product_add_to_cart
for select using (true);

create or replace function public.increment_product_add_to_cart(p_product_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.product_add_to_cart (product_id, adds, last_added_at)
  values (p_product_id, 1, now())
  on conflict (product_id)
  do update set
    adds = public.product_add_to_cart.adds + 1,
    last_added_at = now();
end;
$$;

grant execute on function public.increment_product_add_to_cart(uuid) to anon, authenticated;

create table if not exists public.search_logs (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized_term text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_logs_normalized
  on public.search_logs (normalized_term);
create index if not exists idx_search_logs_created
  on public.search_logs (created_at);

alter table public.search_logs enable row level security;

drop policy if exists "insert search logs" on public.search_logs;
create policy "insert search logs" on public.search_logs
for insert with check (true);

drop policy if exists "staff read search logs" on public.search_logs;
create policy "staff read search logs" on public.search_logs
for select using (public.is_staff());

create or replace function public.log_search_term(p_term text, p_normalized text)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.search_logs (term, normalized_term, user_id)
  values (p_term, p_normalized, auth.uid());
end;
$$;

grant execute on function public.log_search_term(text, text) to anon, authenticated;

create or replace function public.get_trending_searches(p_days int, p_limit int)
returns table(term text, searches int)
language sql
security definer
as $$
  select coalesce(max(term), normalized_term) as term,
         count(*)::int as searches
  from public.search_logs
  where created_at >= now() - (p_days || ' days')::interval
  group by normalized_term
  order by searches desc
  limit coalesce(p_limit, 8);
$$;

grant execute on function public.get_trending_searches(int, int) to anon, authenticated;

create table if not exists public.user_recent_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists idx_user_recent_views_user
  on public.user_recent_views (user_id, last_viewed_at desc);

alter table public.user_recent_views enable row level security;

drop policy if exists "user read own recent views" on public.user_recent_views;
create policy "user read own recent views" on public.user_recent_views
for select using (auth.uid() = user_id);

drop policy if exists "user insert own recent views" on public.user_recent_views;
create policy "user insert own recent views" on public.user_recent_views
for insert with check (auth.uid() = user_id);

drop policy if exists "user update own recent views" on public.user_recent_views;
create policy "user update own recent views" on public.user_recent_views
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.record_recent_view(p_product_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_recent_views (user_id, product_id, last_viewed_at)
  values (auth.uid(), p_product_id, now())
  on conflict (user_id, product_id)
  do update set last_viewed_at = now();
end;
$$;

grant execute on function public.record_recent_view(uuid) to authenticated;

create table if not exists public.product_restock_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  prev_qty int not null,
  new_qty int not null,
  restocked_at timestamptz not null default now()
);

create index if not exists idx_restock_product
  on public.product_restock_events (product_id);
create index if not exists idx_restock_time
  on public.product_restock_events (restocked_at desc);

alter table public.product_restock_events enable row level security;

drop policy if exists "public read restock events" on public.product_restock_events;
create policy "public read restock events" on public.product_restock_events
for select using (true);

create or replace function public.fn_log_restock_event()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_old_qty int := 0;
  v_new_qty int;
  v_insert_restocked_at timestamptz;
  v_update_restocked_at timestamptz;
begin
  v_product_id := new.product_id;
  v_variant_id := new.id;
  v_new_qty := coalesce(new.qty, 0);
  v_insert_restocked_at := coalesce(new.last_stock_added_at, new.created_at, now());
  v_update_restocked_at := coalesce(new.last_stock_added_at, now());

  if tg_op = 'INSERT' then
    if v_new_qty > 0 then
      insert into public.product_restock_events (product_id, variant_id, prev_qty, new_qty, restocked_at)
      values (v_product_id, v_variant_id, 0, v_new_qty, v_insert_restocked_at);
    end if;
  else
    v_old_qty := coalesce(old.qty, 0);
    if v_old_qty <= 0 and v_new_qty > 0 then
      insert into public.product_restock_events (product_id, variant_id, prev_qty, new_qty, restocked_at)
      values (v_product_id, v_variant_id, v_old_qty, v_new_qty, v_update_restocked_at);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_variants_restock on public.product_variants;
create trigger trg_product_variants_restock
after insert or update of qty on public.product_variants
for each row execute procedure public.fn_log_restock_event();

update public.product_variants
set first_stocked_at = case
      when qty > 0 then coalesce(first_stocked_at, created_at)
      else first_stocked_at
    end,
    in_stock_since = case
      when qty > 0 then coalesce(in_stock_since, created_at)
      else null
    end,
    last_stock_added_at = case
      when qty > 0 then coalesce(last_stock_added_at, created_at)
      else last_stock_added_at
    end,
    last_qty_changed_at = coalesce(last_qty_changed_at, created_at)
where first_stocked_at is null
   or in_stock_since is distinct from case when qty > 0 then coalesce(in_stock_since, created_at) else null end
   or last_stock_added_at is null
   or last_qty_changed_at is null;

create table if not exists public.variant_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  qty_delta int not null check (qty_delta <> 0),
  prev_qty int not null check (prev_qty >= 0),
  new_qty int not null check (new_qty >= 0),
  movement_type text not null check (movement_type in ('initial_stock','restock','increase','deduction','sellout')),
  actor_user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_variant_stock_movements_variant_time
  on public.variant_stock_movements (variant_id, recorded_at desc);
create index if not exists idx_variant_stock_movements_product_time
  on public.variant_stock_movements (product_id, recorded_at desc);

alter table public.variant_stock_movements enable row level security;

drop policy if exists "staff read variant stock movements" on public.variant_stock_movements;
create policy "staff read variant stock movements" on public.variant_stock_movements
for select using (public.is_staff());

create or replace function public.fn_track_variant_qty_before()
returns trigger
language plpgsql
as $$
declare
  v_now timestamptz;
begin
  v_now := coalesce(new.created_at, now());

  if tg_op = 'INSERT' then
    new.last_qty_changed_at := coalesce(new.last_qty_changed_at, v_now);
    if coalesce(new.qty, 0) > 0 then
      new.first_stocked_at := coalesce(new.first_stocked_at, v_now);
      new.in_stock_since := coalesce(new.in_stock_since, v_now);
      new.last_stock_added_at := coalesce(new.last_stock_added_at, v_now);
    else
      new.in_stock_since := null;
    end if;
    return new;
  end if;

  if coalesce(new.qty, 0) = coalesce(old.qty, 0) then
    return new;
  end if;

  v_now := now();
  new.last_qty_changed_at := v_now;

  if coalesce(new.qty, 0) > coalesce(old.qty, 0) then
    if coalesce(new.qty, 0) > 0 then
      new.first_stocked_at := coalesce(new.first_stocked_at, old.first_stocked_at, v_now);
      new.last_stock_added_at := v_now;
      if coalesce(old.qty, 0) <= 0 then
        new.in_stock_since := v_now;
      end if;
    end if;
  elsif coalesce(new.qty, 0) <= 0 then
    new.in_stock_since := null;
  end if;

  if coalesce(new.qty, 0) > 0 and new.first_stocked_at is null then
    new.first_stocked_at := coalesce(old.first_stocked_at, v_now);
  end if;

  return new;
end;
$$;

create or replace function public.fn_log_variant_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_qty int := 0;
  v_new_qty int;
  v_delta int;
  v_movement_type text;
  v_recorded_at timestamptz;
  v_product_id uuid;
  v_variant_id uuid;
  v_created_at timestamptz;
  v_last_stock_added_at timestamptz;
begin
  v_new_qty := coalesce(new.qty, 0);
  v_recorded_at := coalesce(new.last_qty_changed_at, now());
  v_product_id := new.product_id;
  v_variant_id := new.id;
  v_created_at := new.created_at;
  v_last_stock_added_at := new.last_stock_added_at;

  if tg_op = 'INSERT' then
    if v_new_qty = 0 then
      return new;
    end if;

    insert into public.variant_stock_movements (
      product_id,
      variant_id,
      qty_delta,
      prev_qty,
      new_qty,
      movement_type,
      actor_user_id,
      recorded_at
    )
    values (
      v_product_id,
      v_variant_id,
      v_new_qty,
      0,
      v_new_qty,
      'initial_stock',
      auth.uid(),
      coalesce(v_last_stock_added_at, v_created_at, v_recorded_at)
    );

    return new;
  end if;

  v_prev_qty := coalesce(old.qty, 0);
  if v_prev_qty = v_new_qty then
    return new;
  end if;

  v_delta := v_new_qty - v_prev_qty;
  v_movement_type := case
    when v_delta > 0 and v_prev_qty <= 0 and v_new_qty > 0 then 'restock'
    when v_delta > 0 then 'increase'
    when v_new_qty <= 0 then 'sellout'
    else 'deduction'
  end;

  insert into public.variant_stock_movements (
    product_id,
    variant_id,
    qty_delta,
    prev_qty,
    new_qty,
    movement_type,
    actor_user_id,
    recorded_at
  )
  values (
    v_product_id,
    v_variant_id,
    v_delta,
    v_prev_qty,
    v_new_qty,
    v_movement_type,
    auth.uid(),
    v_recorded_at
  );

  return new;
end;
$$;

drop trigger if exists trg_product_variants_qty_tracking_before on public.product_variants;
create trigger trg_product_variants_qty_tracking_before
before insert or update of qty on public.product_variants
for each row execute procedure public.fn_track_variant_qty_before();

drop trigger if exists trg_variant_stock_movements_log on public.product_variants;
create trigger trg_variant_stock_movements_log
after insert or update of qty on public.product_variants
for each row execute procedure public.fn_log_variant_stock_movement();

insert into public.variant_stock_movements (
  product_id,
  variant_id,
  qty_delta,
  prev_qty,
  new_qty,
  movement_type,
  recorded_at,
  meta
)
select
  pv.product_id,
  pv.id,
  pv.qty,
  0,
  pv.qty,
  'initial_stock',
  coalesce(pv.last_stock_added_at, pv.first_stocked_at, pv.created_at),
  jsonb_build_object('seeded', true)
from public.product_variants pv
where pv.qty > 0
  and not exists (
    select 1
    from public.variant_stock_movements m
    where m.variant_id = pv.id
  );

create or replace function public.fn_admin_inventory_stock_health(
  include_archived boolean default false,
  stale_days integer default 60,
  recent_sales_days integer default 30,
  item_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold_days integer := greatest(coalesce(stale_days, 60), 1);
  v_recent_sales_days integer := greatest(coalesce(recent_sales_days, 30), 1);
  v_item_limit integer := greatest(coalesce(item_limit, 12), 1);
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  with eligible_order_items as (
    select
      coalesce(oi.variant_id, oi.item_id) as variant_id,
      regexp_replace(
        lower(
          trim(
            regexp_replace(
              coalesce(nullif(trim(oi.item_name), ''), nullif(trim(oi.product_title), ''), sp.title, ''),
              '\s*\([^)]*\)\s*$',
              ''
            )
          )
        ),
        '\s+',
        ' ',
        'g'
      ) as normalized_title,
      lower(
        nullif(
          trim(
            coalesce(
              nullif(oi.condition, ''),
              sv.condition,
              case
                when coalesce(oi.item_name, oi.product_title, '') ilike '%(SEALED)%' then 'sealed'
                when coalesce(oi.item_name, oi.product_title, '') ilike '%(UNSEALED)%' then 'unsealed'
                else null
              end,
              ''
            )
          ),
          ''
        )
      ) as normalized_condition,
      greatest(coalesce(oi.qty, 0), 0)::int as qty,
      coalesce(o.paid_at, o.created_at) as sold_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_variants sv on sv.id = coalesce(oi.variant_id, oi.item_id)
    left join public.products sp on sp.id = coalesce(oi.product_id, sv.product_id)
    where (coalesce(o.payment_status, '') = 'PAID' or upper(coalesce(o.channel, '')) = 'POS')
      and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
  ),
  sales_direct as (
    select
      variant_id,
      coalesce(sum(qty), 0)::int as sold_lifetime,
      coalesce(
        sum(
          case
            when sold_at >= now() - make_interval(days => v_recent_sales_days) then qty
            else 0
          end
        ),
        0
      )::int as sold_recent,
      max(sold_at) as last_sold_at
    from eligible_order_items
    where variant_id is not null
    group by variant_id
  ),
  sales_by_title as (
    select
      normalized_title,
      normalized_condition,
      coalesce(sum(qty), 0)::int as sold_lifetime,
      coalesce(
        sum(
          case
            when sold_at >= now() - make_interval(days => v_recent_sales_days) then qty
            else 0
          end
        ),
        0
      )::int as sold_recent,
      max(sold_at) as last_sold_at
    from eligible_order_items
    where normalized_title is not null
      and normalized_title <> ''
    group by normalized_title, normalized_condition
  ),
  live_carts as (
    select
      pv.id as variant_id,
      count(distinct ci.user_id)::int as live_cart_users,
      coalesce(sum(ci.qty), 0)::int as live_cart_qty
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    group by pv.id
  ),
  demand as (
    select
      pv.id as variant_id,
      coalesce(pc.clicks, 0)::int as views,
      coalesce(pac.adds, 0)::int as cart_adds,
      coalesce(lc.live_cart_users, 0)::int as live_cart_users,
      coalesce(lc.live_cart_qty, 0)::int as live_cart_qty,
      greatest(
        coalesce(pc.last_clicked_at, '-infinity'::timestamptz),
        coalesce(pac.last_added_at, '-infinity'::timestamptz)
      ) as last_activity_at
    from public.product_variants pv
    left join public.product_clicks pc on pc.product_id = pv.product_id
    left join public.product_add_to_cart pac on pac.product_id = pv.product_id
    left join live_carts lc on lc.variant_id = pv.id
  ),
  base as (
    select
      pv.id as variant_id,
      pv.product_id,
      p.title,
      p.brand,
      p.model,
      p.variation,
      pv.condition,
      pv.qty,
      pv.price,
      pv.first_stocked_at,
      pv.in_stock_since,
      pv.last_stock_added_at,
      pv.last_qty_changed_at,
      pv.stale_reviewed_at,
      greatest(
        coalesce(pv.stale_reviewed_at, '-infinity'::timestamptz),
        coalesce(pv.in_stock_since, pv.first_stocked_at, pv.created_at)
      ) as stale_basis_at,
      coalesce(sd.sold_recent, st.sold_recent, 0)::int as sold_recent,
      coalesce(sd.sold_lifetime, st.sold_lifetime, 0)::int as sold_lifetime,
      coalesce(sd.last_sold_at, st.last_sold_at) as last_sold_at,
      coalesce(d.views, 0)::int as views,
      coalesce(d.cart_adds, 0)::int as cart_adds,
      coalesce(d.live_cart_users, 0)::int as live_cart_users,
      coalesce(d.live_cart_qty, 0)::int as live_cart_qty,
      (
        coalesce(d.views, 0)
        + coalesce(d.cart_adds, 0) * 3
        + coalesce(d.live_cart_qty, 0) * 5
      )::int as demand_score,
      nullif(d.last_activity_at, '-infinity'::timestamptz) as last_activity_at,
      coalesce(p.image_urls[1], '') as image_url,
      greatest(
        floor(
          extract(
            epoch from now() - greatest(
              coalesce(pv.stale_reviewed_at, '-infinity'::timestamptz),
              coalesce(pv.in_stock_since, pv.first_stocked_at, pv.created_at)
            )
          ) / 86400
        )::int,
        0
      ) as days_in_stock,
      coalesce(pv.qty * pv.price, 0) as retail_value
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join sales_direct sd on sd.variant_id = pv.id
    left join sales_by_title st
      on sd.variant_id is null
      and st.normalized_title = regexp_replace(lower(trim(p.title)), '\s+', ' ', 'g')
      and st.normalized_condition = lower(nullif(trim(coalesce(pv.condition, '')), ''))
    left join demand d on d.variant_id = pv.id
    where pv.qty > 0
      and (include_archived or p.is_active = true)
  ),
  stale as (
    select *
    from base
    where days_in_stock >= v_threshold_days
      and sold_recent = 0
    order by days_in_stock desc, demand_score desc, retail_value desc, title asc
  ),
  summary as (
    select
      count(*)::int as stale_variants,
      coalesce(sum(qty), 0)::int as stale_units,
      coalesce(sum(retail_value), 0) as stale_retail_value,
      coalesce(sum(views), 0)::int as stale_views,
      coalesce(sum(cart_adds), 0)::int as stale_cart_adds,
      coalesce(sum(live_cart_qty), 0)::int as stale_live_cart_qty,
      coalesce(sum(demand_score), 0)::int as stale_demand_score,
      coalesce(max(days_in_stock), 0)::int as max_days_in_stock
    from stale
  )
  select jsonb_build_object(
    'threshold_days', v_threshold_days,
    'recent_sales_days', v_recent_sales_days,
    'stale_variants', summary.stale_variants,
    'stale_units', summary.stale_units,
    'stale_retail_value', summary.stale_retail_value,
    'stale_views', summary.stale_views,
    'stale_cart_adds', summary.stale_cart_adds,
    'stale_live_cart_qty', summary.stale_live_cart_qty,
    'stale_demand_score', summary.stale_demand_score,
    'max_days_in_stock', summary.max_days_in_stock,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'variant_id', item.variant_id,
            'product_id', item.product_id,
            'title', item.title,
            'brand', item.brand,
            'model', item.model,
            'variation', item.variation,
            'condition', item.condition,
            'qty', item.qty,
            'price', item.price,
            'retail_value', item.retail_value,
            'days_in_stock', item.days_in_stock,
            'in_stock_since', item.in_stock_since,
            'first_stocked_at', item.first_stocked_at,
            'last_stock_added_at', item.last_stock_added_at,
            'last_qty_changed_at', item.last_qty_changed_at,
            'stale_reviewed_at', item.stale_reviewed_at,
            'stale_basis_at', item.stale_basis_at,
            'sold_recent', item.sold_recent,
            'sold_lifetime', item.sold_lifetime,
            'last_sold_at', item.last_sold_at,
            'views', item.views,
            'cart_adds', item.cart_adds,
            'live_cart_users', item.live_cart_users,
            'live_cart_qty', item.live_cart_qty,
            'demand_score', item.demand_score,
            'last_activity_at', item.last_activity_at,
            'image_url', nullif(item.image_url, '')
          )
        )
        from (
          select *
          from stale
          limit v_item_limit
        ) item
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from summary;

  return v_result;
end;
$$;

revoke execute on function public.fn_admin_inventory_stock_health(boolean, integer, integer, integer) from public;
grant execute on function public.fn_admin_inventory_stock_health(boolean, integer, integer, integer) to authenticated;

create or replace function public.get_cart_counts(p_product_ids uuid[])
returns table(product_id uuid, cart_count int)
language sql
security definer
as $$
  select pv.product_id,
         count(distinct ci.user_id)::int as cart_count
  from public.cart_items ci
  join public.product_variants pv on pv.id = ci.variant_id
  where pv.product_id = any(p_product_ids)
  group by pv.product_id;
$$;

grant execute on function public.get_cart_counts(uuid[]) to anon, authenticated;

create or replace function public.get_top_sellers(p_days int, p_limit int)
returns table(product_id uuid, sold_qty int)
language sql
security definer
as $$
  select oi.product_id, sum(oi.qty)::int as sold_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'PAID'
    and (p_days is null or p_days <= 0 or o.paid_at >= now() - (p_days || ' days')::interval)
  group by oi.product_id
  order by sold_qty desc
  limit coalesce(p_limit, 12);
$$;

grant execute on function public.get_top_sellers(int, int) to anon, authenticated;

create or replace function public.get_sales_counts(p_product_ids uuid[], p_days int)
returns table(product_id uuid, sold_qty int)
language sql
security definer
as $$
  select oi.product_id, sum(oi.qty)::int as sold_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = any(p_product_ids)
    and o.payment_status = 'PAID'
    and (p_days is null or p_days <= 0 or o.paid_at >= now() - (p_days || ' days')::interval)
  group by oi.product_id;
$$;

grant execute on function public.get_sales_counts(uuid[], int) to anon, authenticated;

create or replace function public.get_customers_also_viewed(p_product_id uuid, p_limit int)
returns table(product_id uuid, views int)
language sql
security definer
as $$
  select urv2.product_id, count(*)::int as views
  from public.user_recent_views urv
  join public.user_recent_views urv2
    on urv.user_id = urv2.user_id
   and urv2.product_id <> p_product_id
  where urv.product_id = p_product_id
  group by urv2.product_id
  order by views desc
  limit coalesce(p_limit, 8);
$$;

grant execute on function public.get_customers_also_viewed(uuid, int) to anon, authenticated;

create or replace function public.get_frequently_bought_together(p_product_id uuid, p_limit int)
returns table(product_id uuid, times_bought int)
language sql
security definer
as $$
  select oi2.product_id, count(*)::int as times_bought
  from public.order_items oi
  join public.order_items oi2
    on oi.order_id = oi2.order_id
   and oi2.product_id <> p_product_id
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.payment_status = 'PAID'
  group by oi2.product_id
  order by times_bought desc
  limit coalesce(p_limit, 8);
$$;

grant execute on function public.get_frequently_bought_together(uuid, int) to anon, authenticated;

-- Customer feedback
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  rating int,
  experience text,
  change text,
  status text not null default 'NEW'
);

create index if not exists idx_customer_feedback_status
  on public.customer_feedback (status, created_at desc);

alter table public.customer_feedback enable row level security;

drop policy if exists "admin read customer feedback" on public.customer_feedback;
create policy "admin read customer feedback" on public.customer_feedback
for select using (public.is_admin());

drop policy if exists "admin update customer feedback" on public.customer_feedback;
create policy "admin update customer feedback" on public.customer_feedback
for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.fn_submit_feedback(
  p_order_id uuid default null,
  p_rating int default null,
  p_experience text default null,
  p_change text default null,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_rating is null and coalesce(trim(p_experience), '') = '' and coalesce(trim(p_change), '') = '' then
    raise exception 'Feedback is empty.';
  end if;

  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  insert into public.customer_feedback (order_id, user_id, user_email, rating, experience, change)
  values (
    p_order_id,
    auth.uid(),
    nullif(trim(p_user_email), ''),
    p_rating,
    nullif(trim(p_experience), ''),
    nullif(trim(p_change), '')
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.fn_submit_feedback(uuid, int, text, text, text) from public;
grant execute on function public.fn_submit_feedback(uuid, int, text, text, text) to anon, authenticated;

create or replace function public.fn_buyer_update_payment_method(
  p_order_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_order public.orders%rowtype;
  v_method text;
  v_status text;
  v_exists boolean;
begin
  v_method := upper(trim(coalesce(p_payment_method, '')));
  if v_method = '' then
    raise exception 'Payment method required.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if v_order.payment_status = 'PAID' then
    raise exception 'Order already paid.';
  end if;

  v_status := upper(trim(coalesce(v_order.status, '')));
  if v_status not in ('PENDING_PAYMENT','PENDING_APPROVAL','AWAITING_PAYMENT') then
    raise exception 'Payment method cannot be changed at this stage.';
  end if;

  select true into v_exists
  from public.payment_methods pm
  where upper(trim(pm.method)) = v_method
    and pm.is_active = true
  limit 1;

  if not coalesce(v_exists, false) then
    raise exception 'Payment method unavailable.';
  end if;

  if v_method = upper(trim(coalesce(v_order.payment_method, ''))) then
    return jsonb_build_object('ok', true, 'order_id', p_order_id, 'unchanged', true);
  end if;

  update public.orders
    set payment_method = v_method
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

revoke execute on function public.fn_buyer_update_payment_method(uuid, text) from public;
grant execute on function public.fn_buyer_update_payment_method(uuid, text) to authenticated;

-- Product image auto-match uploads
insert into storage.buckets (id, name, public)
values ('product-uploads', 'product-uploads', true)
on conflict (id) do nothing;

drop policy if exists "product uploads read" on storage.objects;
create policy "product uploads read" on storage.objects
for select using (bucket_id = 'product-uploads');

drop policy if exists "product uploads insert" on storage.objects;
create policy "product uploads insert" on storage.objects
for insert with check (bucket_id = 'product-uploads' and public.is_staff());

create table if not exists public.product_image_hashes (
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  image_hash text not null,
  hash_algo text not null default 'dhash-64',
  created_at timestamptz not null default now(),
  primary key (product_id, image_url, hash_algo)
);

create index if not exists idx_product_image_hashes_product
  on public.product_image_hashes (product_id);

create index if not exists idx_product_image_hashes_algo_hash
  on public.product_image_hashes (hash_algo, image_hash);

alter table public.product_image_hashes enable row level security;

drop policy if exists "staff read product image hashes" on public.product_image_hashes;
create policy "staff read product image hashes" on public.product_image_hashes
for select using (public.is_staff());

drop policy if exists "staff manage product image hashes" on public.product_image_hashes;
create policy "staff manage product image hashes" on public.product_image_hashes
for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.product_upload_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploader_user_id uuid references auth.users(id) on delete set null,
  upload_url text not null,
  upload_hash text,
  upload_hashes jsonb,
  status text not null default 'NEEDS_REVIEW'
    check (status in ('APPLIED','NEEDS_REVIEW','NO_MATCH','ERROR')),
  review_reason text,
  matched_product_id uuid references public.products(id) on delete set null,
  matched_image_url text,
  confidence numeric,
  distance int,
  candidates jsonb,
  applied_at timestamptz
);

create index if not exists idx_product_upload_matches_status
  on public.product_upload_matches (status, created_at desc);

alter table public.product_upload_matches enable row level security;

drop policy if exists "staff read product upload matches" on public.product_upload_matches;
create policy "staff read product upload matches" on public.product_upload_matches
for select using (public.is_staff());

drop policy if exists "staff manage product upload matches" on public.product_upload_matches;
create policy "staff manage product upload matches" on public.product_upload_matches
for all using (public.is_staff()) with check (public.is_staff());

-- Product image features (embeddings, OCR, color)
create table if not exists public.product_image_features (
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  clip_embedding real[],
  ocr_text text,
  ocr_tokens text[],
  color_hist real[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, image_url)
);

create index if not exists idx_product_image_features_product
  on public.product_image_features (product_id);

alter table public.product_image_features enable row level security;

drop policy if exists "staff read product image features" on public.product_image_features;
create policy "staff read product image features" on public.product_image_features
for select using (public.is_staff());

drop policy if exists "staff manage product image features" on public.product_image_features;
create policy "staff manage product image features" on public.product_image_features
for all using (public.is_staff()) with check (public.is_staff());

-- Web push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text not null default 'unknown',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

create index if not exists idx_push_subscriptions_user_active
  on public.push_subscriptions (user_id, disabled_at);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions" on public.push_subscriptions
for select using (auth.uid() = user_id);

drop policy if exists "users insert own push subscriptions" on public.push_subscriptions;
create policy "users insert own push subscriptions" on public.push_subscriptions
for insert with check (auth.uid() = user_id);

drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions" on public.push_subscriptions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions" on public.push_subscriptions
for delete using (auth.uid() = user_id);

-- Growth analytics event logging + first-wave reporting
alter table public.orders
  add column if not exists channel text not null default 'WEB',
  add column if not exists shipping_discount numeric not null default 0,
  add column if not exists discount_total numeric not null default 0;

create table if not exists public.product_view_events (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_view_events_product_time
  on public.product_view_events (product_id, created_at desc);
create index if not exists idx_product_view_events_created
  on public.product_view_events (created_at desc);

alter table public.product_view_events enable row level security;

drop policy if exists "staff read product view events" on public.product_view_events;
create policy "staff read product view events" on public.product_view_events
for select using (public.is_staff());

create table if not exists public.product_cart_events (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  qty integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_cart_events_product_time
  on public.product_cart_events (product_id, created_at desc);
create index if not exists idx_product_cart_events_variant_time
  on public.product_cart_events (variant_id, created_at desc);
create index if not exists idx_product_cart_events_created
  on public.product_cart_events (created_at desc);

alter table public.product_cart_events enable row level security;

drop policy if exists "staff read product cart events" on public.product_cart_events;
create policy "staff read product cart events" on public.product_cart_events
for select using (public.is_staff());

create or replace function public.increment_product_click_detailed(
  p_product_id uuid,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
begin
  if p_product_id is null then
    raise exception 'Product id required.';
  end if;

  v_user_id := auth.uid();

  insert into public.product_clicks (product_id, clicks, last_clicked_at)
  values (p_product_id, 1, now())
  on conflict (product_id)
  do update set
    clicks = public.product_clicks.clicks + 1,
    last_clicked_at = now();

  insert into public.product_view_events (
    product_id,
    user_id,
    session_id,
    created_at
  )
  values (
    p_product_id,
    v_user_id,
    case when v_user_id is null then p_session_id else null end,
    now()
  );
end;
$$;

grant execute on function public.increment_product_click_detailed(uuid, uuid) to anon, authenticated;

create or replace function public.increment_product_click(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.increment_product_click_detailed(p_product_id, null);
end;
$$;

grant execute on function public.increment_product_click(uuid) to anon, authenticated;

create or replace function public.increment_product_add_to_cart_detailed(
  p_product_id uuid,
  p_variant_id uuid default null,
  p_qty integer default 1,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid;
  v_qty integer;
begin
  if p_product_id is null then
    raise exception 'Product id required.';
  end if;

  v_user_id := auth.uid();
  v_qty := greatest(coalesce(p_qty, 1), 1);

  insert into public.product_add_to_cart (product_id, adds, last_added_at)
  values (p_product_id, 1, now())
  on conflict (product_id)
  do update set
    adds = public.product_add_to_cart.adds + 1,
    last_added_at = now();

  insert into public.product_cart_events (
    product_id,
    variant_id,
    user_id,
    session_id,
    qty,
    created_at
  )
  values (
    p_product_id,
    p_variant_id,
    v_user_id,
    case when v_user_id is null then p_session_id else null end,
    v_qty,
    now()
  );
end;
$$;

grant execute on function public.increment_product_add_to_cart_detailed(uuid, uuid, integer, uuid) to anon, authenticated;

create or replace function public.increment_product_add_to_cart(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.increment_product_add_to_cart_detailed(p_product_id, null, 1, null);
end;
$$;

grant execute on function public.increment_product_add_to_cart(uuid) to anon, authenticated;

create or replace function public.fn_admin_growth_analytics(
  p_from date default null,
  p_to date default null,
  p_item_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_from date := coalesce(p_from, current_date - 29);
  v_to date := coalesce(p_to, current_date);
  v_limit integer := greatest(coalesce(p_item_limit, 8), 1);
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if v_to < v_from then
    raise exception 'Invalid date range';
  end if;

  v_from_ts := v_from::timestamp;
  v_to_ts := (v_to + 1)::timestamp;

  with paid_orders_all as (
    select
      o.id,
      o.user_id,
      o.sales_customer_id,
      o.customer_name,
      o.customer_phone,
      o.contact,
      coalesce(o.paid_at, o.created_at) as sold_at,
      upper(trim(coalesce(o.channel, 'WEB'))) as channel,
      coalesce(nullif(upper(trim(coalesce(o.payment_method, ''))), ''), 'UNKNOWN') as payment_method,
      greatest(coalesce(o.discount_total, 0) - coalesce(o.shipping_discount, 0), 0) as item_discount,
      o.shipping_details
    from public.orders o
    where (coalesce(o.payment_status, '') = 'PAID' or upper(coalesce(o.channel, '')) = 'POS')
      and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
  ),
  paid_orders_range as (
    select *
    from paid_orders_all
    where sold_at >= v_from_ts
      and sold_at < v_to_ts
  ),
  customer_order_rank as (
    select
      o.id,
      coalesce(
        case
          when o.sales_customer_id is not null then 'sales_customer:' || o.sales_customer_id::text
        end,
        case
          when o.channel <> 'POS' and o.user_id is not null then 'user:' || o.user_id::text
        end,
        case
          when nullif(lower(trim(coalesce(o.shipping_details->>'receiver_email', o.shipping_details->>'email', ''))), '') is not null
            then 'email:' || lower(trim(coalesce(o.shipping_details->>'receiver_email', o.shipping_details->>'email', '')))
        end,
        case
          when nullif(regexp_replace(coalesce(o.shipping_details->>'receiver_phone', o.customer_phone, o.contact, o.shipping_details->>'phone', ''), '[^0-9]+', '', 'g'), '') is not null
            then 'phone:' || regexp_replace(coalesce(o.shipping_details->>'receiver_phone', o.customer_phone, o.contact, o.shipping_details->>'phone', ''), '[^0-9]+', '', 'g')
        end,
        case
          when nullif(lower(trim(coalesce(o.shipping_details->>'receiver_name', o.customer_name, o.shipping_details->>'name', ''))), '') is not null
            then 'name:' || lower(trim(coalesce(o.shipping_details->>'receiver_name', o.customer_name, o.shipping_details->>'name', '')))
        end,
        'order:' || o.id::text
      ) as customer_key,
      row_number() over (
        partition by coalesce(
          case
            when o.sales_customer_id is not null then 'sales_customer:' || o.sales_customer_id::text
          end,
          case
            when o.channel <> 'POS' and o.user_id is not null then 'user:' || o.user_id::text
          end,
          case
            when nullif(lower(trim(coalesce(o.shipping_details->>'receiver_email', o.shipping_details->>'email', ''))), '') is not null
              then 'email:' || lower(trim(coalesce(o.shipping_details->>'receiver_email', o.shipping_details->>'email', '')))
          end,
          case
            when nullif(regexp_replace(coalesce(o.shipping_details->>'receiver_phone', o.customer_phone, o.contact, o.shipping_details->>'phone', ''), '[^0-9]+', '', 'g'), '') is not null
              then 'phone:' || regexp_replace(coalesce(o.shipping_details->>'receiver_phone', o.customer_phone, o.contact, o.shipping_details->>'phone', ''), '[^0-9]+', '', 'g')
          end,
          case
            when nullif(lower(trim(coalesce(o.shipping_details->>'receiver_name', o.customer_name, o.shipping_details->>'name', ''))), '') is not null
              then 'name:' || lower(trim(coalesce(o.shipping_details->>'receiver_name', o.customer_name, o.shipping_details->>'name', '')))
          end,
          'order:' || o.id::text
        )
        order by o.sold_at asc, o.id asc
      ) as order_number
    from paid_orders_all o
  ),
  order_lines_range as (
    select
      oi.order_id,
      oi.variant_id,
      coalesce(pv.product_id, oi.product_id) as product_id,
      coalesce(nullif(trim(oi.item_name), ''), nullif(trim(oi.product_title), ''), nullif(trim(p.title), ''), 'Item') as item_name,
      p.title,
      p.brand,
      p.model,
      p.variation,
      coalesce(oi.image_url, p.image_urls[1]) as image_url,
      coalesce(oi.condition, pv.condition, '') as condition,
      greatest(coalesce(oi.qty, 0), 0)::numeric as qty,
      coalesce(
        nullif(oi.line_total, 0),
        coalesce(oi.price_each, oi.unit_price, pv.price, 0) * greatest(coalesce(oi.qty, 0), 0)
      ) as line_revenue_raw,
      coalesce(oi.cost_each, pv.cost, 0) * greatest(coalesce(oi.qty, 0), 0) as line_cogs
    from public.order_items oi
    join paid_orders_range o on o.id = oi.order_id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products p on p.id = coalesce(pv.product_id, oi.product_id)
  ),
  order_rollup as (
    select
      order_id,
      coalesce(sum(line_revenue_raw), 0) as revenue_raw,
      coalesce(sum(line_cogs), 0) as cogs
    from order_lines_range
    group by order_id
  ),
  order_adjustment as (
    select
      o.id as order_id,
      o.channel,
      o.payment_method,
      coalesce(r.revenue_raw, 0) as revenue_raw,
      coalesce(r.cogs, 0) as cogs,
      greatest(coalesce(r.revenue_raw, 0) - least(o.item_discount, coalesce(r.revenue_raw, 0)), 0) as revenue_adjusted,
      case
        when coalesce(r.revenue_raw, 0) > 0
          then greatest(coalesce(r.revenue_raw, 0) - least(o.item_discount, coalesce(r.revenue_raw, 0)), 0) / r.revenue_raw
        else 1
      end as revenue_factor
    from paid_orders_range o
    left join order_rollup r on r.order_id = o.id
  ),
  order_lines_adjusted as (
    select
      l.*,
      a.channel,
      a.payment_method,
      l.line_revenue_raw * a.revenue_factor as line_revenue
    from order_lines_range l
    join order_adjustment a on a.order_id = l.order_id
  ),
  views_range as (
    select
      e.product_id,
      count(*)::int as views,
      max(e.created_at) as last_viewed_at
    from public.product_view_events e
    where e.created_at >= v_from_ts
      and e.created_at < v_to_ts
    group by e.product_id
  ),
  carts_range as (
    select
      e.product_id,
      count(*)::int as cart_adds,
      coalesce(sum(e.qty), 0)::int as cart_qty,
      max(e.created_at) as last_carted_at
    from public.product_cart_events e
    where e.created_at >= v_from_ts
      and e.created_at < v_to_ts
    group by e.product_id
  ),
  product_sales_range as (
    select
      l.product_id,
      count(distinct l.order_id)::int as paid_orders,
      coalesce(sum(l.qty), 0)::int as sold_qty,
      coalesce(sum(l.line_revenue), 0) as revenue,
      coalesce(sum(l.line_cogs), 0) as cogs
    from order_lines_adjusted l
    where l.product_id is not null
    group by l.product_id
  ),
  product_catalog as (
    select
      p.id as product_id,
      p.title,
      p.brand,
      p.model,
      p.variation,
      coalesce(p.image_urls[1], '') as image_url,
      coalesce(sum(pv.qty), 0)::int as stock_qty
    from public.products p
    left join public.product_variants pv on pv.product_id = p.id
    group by p.id, p.title, p.brand, p.model, p.variation, p.image_urls
  ),
  funnel_products as (
    select
      pc.product_id,
      greatest(coalesce(v.views, 0), coalesce(c.cart_adds, 0))::int as effective_views,
      coalesce(c.cart_adds, 0)::int as cart_adds,
      coalesce(c.cart_qty, 0)::int as cart_qty,
      v.last_viewed_at,
      c.last_carted_at
    from product_catalog pc
    left join views_range v on v.product_id = pc.product_id
    left join carts_range c on c.product_id = pc.product_id
  ),
  top_products as (
    select
      pc.product_id,
      pc.title,
      pc.brand,
      pc.model,
      pc.variation,
      nullif(pc.image_url, '') as image_url,
      coalesce(fp.effective_views, 0)::int as views,
      coalesce(fp.cart_adds, 0)::int as cart_adds,
      coalesce(fp.cart_qty, 0)::int as cart_qty,
      coalesce(s.paid_orders, 0)::int as paid_orders,
      coalesce(s.sold_qty, 0)::int as sold_qty,
      coalesce(s.revenue, 0) as revenue,
      case
        when coalesce(fp.effective_views, 0) > 0
          then (coalesce(fp.cart_adds, 0)::numeric / fp.effective_views) * 100
        else 0
      end as view_to_cart_rate,
      case
        when coalesce(fp.cart_adds, 0) > 0
          then (coalesce(s.paid_orders, 0)::numeric / fp.cart_adds) * 100
        else 0
      end as cart_to_paid_rate,
      case
        when coalesce(fp.effective_views, 0) > 0
          then (coalesce(s.paid_orders, 0)::numeric / fp.effective_views) * 100
        else 0
      end as view_to_paid_rate
    from product_catalog pc
    left join funnel_products fp on fp.product_id = pc.product_id
    left join product_sales_range s on s.product_id = pc.product_id
    where coalesce(fp.effective_views, 0) > 0
       or coalesce(fp.cart_adds, 0) > 0
       or coalesce(s.paid_orders, 0) > 0
    order by coalesce(fp.effective_views, 0) desc, coalesce(fp.cart_adds, 0) desc, coalesce(s.revenue, 0) desc, pc.title asc
    limit v_limit
  ),
  stock_additions as (
    select
      pv.id as variant_id,
      coalesce(sum(case when m.qty_delta > 0 then m.qty_delta else 0 end), 0)::int as units_added
    from public.product_variants pv
    left join public.variant_stock_movements m on m.variant_id = pv.id
    group by pv.id
  ),
  sales_by_variant_all as (
    select
      oi.variant_id,
      coalesce(sum(oi.qty), 0)::int as sold_qty,
      min(coalesce(o.paid_at, o.created_at)) as first_sold_at,
      max(coalesce(o.paid_at, o.created_at)) as last_sold_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where (coalesce(o.payment_status, '') = 'PAID' or upper(coalesce(o.channel, '')) = 'POS')
      and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
    group by oi.variant_id
  ),
  sales_by_variant_range as (
    select
      oi.variant_id,
      coalesce(sum(oi.qty), 0)::int as sold_qty_range
    from public.order_items oi
    join paid_orders_range o on o.id = oi.order_id
    group by oi.variant_id
  ),
  sell_through_base as (
    select
      pv.id as variant_id,
      pv.product_id,
      p.title,
      p.brand,
      p.model,
      p.variation,
      nullif(coalesce(p.image_urls[1], ''), '') as image_url,
      pv.condition,
      coalesce(sa.units_added, greatest(coalesce(pv.qty, 0) + coalesce(sbv.sold_qty, 0), 0))::int as units_added,
      coalesce(sbv.sold_qty, 0)::int as sold_qty_lifetime,
      coalesce(sbr.sold_qty_range, 0)::int as sold_qty_range,
      coalesce(pv.qty, 0)::int as current_qty,
      pv.price,
      coalesce(pv.in_stock_since, pv.first_stocked_at, pv.created_at) as stocked_at,
      sbv.first_sold_at,
      sbv.last_sold_at,
      case
        when sbv.first_sold_at is not null and coalesce(pv.first_stocked_at, pv.created_at) is not null
          then greatest(
            floor(extract(epoch from (sbv.first_sold_at - coalesce(pv.first_stocked_at, pv.created_at))) / 86400)::int,
            0
          )
        else null
      end as days_to_first_sale,
      greatest(
        floor(extract(epoch from (now() - coalesce(pv.in_stock_since, pv.first_stocked_at, pv.created_at))) / 86400)::int,
        0
      ) as days_in_stock,
      case
        when coalesce(sa.units_added, greatest(coalesce(pv.qty, 0) + coalesce(sbv.sold_qty, 0), 0)) > 0
          then (coalesce(sbv.sold_qty, 0)::numeric / coalesce(sa.units_added, greatest(coalesce(pv.qty, 0) + coalesce(sbv.sold_qty, 0), 0))) * 100
        else 0
      end as sell_through_rate
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join stock_additions sa on sa.variant_id = pv.id
    left join sales_by_variant_all sbv on sbv.variant_id = pv.id
    left join sales_by_variant_range sbr on sbr.variant_id = pv.id
  ),
  fast_movers as (
    select *
    from sell_through_base
    where sold_qty_range > 0
       or sold_qty_lifetime > 0
    order by sold_qty_range desc, sell_through_rate desc, coalesce(days_to_first_sale, 999999) asc, title asc
    limit v_limit
  ),
  customer_mix as (
    select
      count(distinct case when cor.order_number = 1 then cor.customer_key end)::int as new_customers,
      count(distinct case when cor.order_number > 1 then cor.customer_key end)::int as returning_customers,
      count(*) filter (where cor.order_number = 1)::int as new_orders,
      count(*) filter (where cor.order_number > 1)::int as returning_orders,
      coalesce(sum(case when cor.order_number = 1 then oa.revenue_adjusted else 0 end), 0) as new_revenue,
      coalesce(sum(case when cor.order_number > 1 then oa.revenue_adjusted else 0 end), 0) as returning_revenue
    from paid_orders_range p
    join customer_order_rank cor on cor.id = p.id
    left join order_adjustment oa on oa.order_id = p.id
  ),
  sold_out_all as (
    select
      pc.product_id,
      pc.title,
      pc.brand,
      pc.model,
      pc.variation,
      nullif(pc.image_url, '') as image_url,
      coalesce(fp.effective_views, 0)::int as views,
      coalesce(fp.cart_adds, 0)::int as cart_adds,
      coalesce(fp.cart_qty, 0)::int as cart_qty,
      coalesce(s.paid_orders, 0)::int as paid_orders,
      coalesce(s.sold_qty, 0)::int as sold_qty,
      coalesce(s.revenue, 0) as revenue,
      coalesce(fp.last_viewed_at, fp.last_carted_at) as last_activity_at,
      (coalesce(fp.effective_views, 0) + coalesce(fp.cart_adds, 0) * 3 + coalesce(s.paid_orders, 0) * 5) as demand_score
    from product_catalog pc
    left join funnel_products fp on fp.product_id = pc.product_id
    left join product_sales_range s on s.product_id = pc.product_id
    where pc.stock_qty <= 0
      and (coalesce(fp.effective_views, 0) > 0 or coalesce(fp.cart_adds, 0) > 0)
  ),
  sold_out_candidates as (
    select *
    from sold_out_all
    order by demand_score desc, views desc, cart_adds desc, title asc
    limit v_limit
  ),
  profitability_channel as (
    select
      channel as key,
      channel as label,
      count(*)::int as orders,
      coalesce(sum(revenue_adjusted), 0) as sales,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(revenue_adjusted - cogs), 0) as profit,
      case
        when coalesce(sum(revenue_adjusted), 0) > 0
          then (sum(revenue_adjusted - cogs) / sum(revenue_adjusted)) * 100
        else 0
      end as margin
    from order_adjustment
    group by channel
    order by sales desc, label asc
  ),
  profitability_payment as (
    select
      payment_method as key,
      payment_method as label,
      count(*)::int as orders,
      coalesce(sum(revenue_adjusted), 0) as sales,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(revenue_adjusted - cogs), 0) as profit,
      case
        when coalesce(sum(revenue_adjusted), 0) > 0
          then (sum(revenue_adjusted - cogs) / sum(revenue_adjusted)) * 100
        else 0
      end as margin
    from order_adjustment
    group by payment_method
    order by sales desc, label asc
  ),
  funnel_summary as (
    select
      coalesce(sum(fp.effective_views), 0)::int as views,
      coalesce(sum(fp.cart_adds), 0)::int as cart_adds,
      coalesce(sum(fp.cart_qty), 0)::int as cart_qty,
      (select count(*) from paid_orders_range)::int as paid_orders,
      coalesce((select sum(revenue_adjusted) from order_adjustment), 0) as revenue
    from funnel_products fp
  ),
  sell_through_summary as (
    select
      count(*)::int as variants_tracked,
      coalesce(sum(units_added), 0)::int as units_added,
      coalesce(sum(sold_qty_lifetime), 0)::int as sold_qty_lifetime,
      coalesce(sum(sold_qty_range), 0)::int as sold_qty_range,
      case
        when coalesce(sum(units_added), 0) > 0
          then (sum(sold_qty_lifetime)::numeric / sum(units_added)) * 100
        else 0
      end as overall_sell_through_rate,
      coalesce(avg(days_to_first_sale) filter (where days_to_first_sale is not null), 0) as avg_days_to_first_sale
    from sell_through_base
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'days', (v_to - v_from) + 1
    ),
    'funnel', jsonb_build_object(
      'views', funnel_summary.views,
      'cart_adds', funnel_summary.cart_adds,
      'cart_qty', funnel_summary.cart_qty,
      'paid_orders', funnel_summary.paid_orders,
      'revenue', funnel_summary.revenue,
      'view_to_cart_rate', case when funnel_summary.views > 0 then (funnel_summary.cart_adds::numeric / funnel_summary.views) * 100 else 0 end,
      'cart_to_paid_rate', case when funnel_summary.cart_adds > 0 then (funnel_summary.paid_orders::numeric / funnel_summary.cart_adds) * 100 else 0 end,
      'view_to_paid_rate', case when funnel_summary.views > 0 then (funnel_summary.paid_orders::numeric / funnel_summary.views) * 100 else 0 end,
      'top_products', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', item.product_id,
              'title', item.title,
              'brand', item.brand,
              'model', item.model,
              'variation', item.variation,
              'image_url', item.image_url,
              'views', item.views,
              'cart_adds', item.cart_adds,
              'cart_qty', item.cart_qty,
              'paid_orders', item.paid_orders,
              'sold_qty', item.sold_qty,
              'revenue', item.revenue,
              'view_to_cart_rate', item.view_to_cart_rate,
              'cart_to_paid_rate', item.cart_to_paid_rate,
              'view_to_paid_rate', item.view_to_paid_rate
            )
          )
          from top_products item
        ),
        '[]'::jsonb
      )
    ),
    'sell_through', jsonb_build_object(
      'variants_tracked', sell_through_summary.variants_tracked,
      'units_added', sell_through_summary.units_added,
      'sold_qty_lifetime', sell_through_summary.sold_qty_lifetime,
      'sold_qty_range', sell_through_summary.sold_qty_range,
      'overall_sell_through_rate', sell_through_summary.overall_sell_through_rate,
      'avg_days_to_first_sale', sell_through_summary.avg_days_to_first_sale,
      'fast_movers', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'variant_id', item.variant_id,
              'product_id', item.product_id,
              'title', item.title,
              'brand', item.brand,
              'model', item.model,
              'variation', item.variation,
              'image_url', item.image_url,
              'condition', item.condition,
              'units_added', item.units_added,
              'sold_qty_lifetime', item.sold_qty_lifetime,
              'sold_qty_range', item.sold_qty_range,
              'current_qty', item.current_qty,
              'price', item.price,
              'sell_through_rate', item.sell_through_rate,
              'days_to_first_sale', item.days_to_first_sale,
              'days_in_stock', item.days_in_stock,
              'stocked_at', item.stocked_at,
              'first_sold_at', item.first_sold_at,
              'last_sold_at', item.last_sold_at
            )
          )
          from fast_movers item
        ),
        '[]'::jsonb
      )
    ),
    'out_of_stock', jsonb_build_object(
      'sold_out_products', (select count(*)::int from sold_out_all),
      'views', coalesce((select sum(item.views) from sold_out_all item), 0)::int,
      'cart_adds', coalesce((select sum(item.cart_adds) from sold_out_all item), 0)::int,
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', item.product_id,
              'title', item.title,
              'brand', item.brand,
              'model', item.model,
              'variation', item.variation,
              'image_url', item.image_url,
              'views', item.views,
              'cart_adds', item.cart_adds,
              'cart_qty', item.cart_qty,
              'paid_orders', item.paid_orders,
              'sold_qty', item.sold_qty,
              'revenue', item.revenue,
              'demand_score', item.demand_score,
              'last_activity_at', item.last_activity_at
            )
          )
          from sold_out_candidates item
        ),
        '[]'::jsonb
      )
    ),
    'customer_mix', jsonb_build_object(
      'new_customers', customer_mix.new_customers,
      'returning_customers', customer_mix.returning_customers,
      'new_orders', customer_mix.new_orders,
      'returning_orders', customer_mix.returning_orders,
      'new_revenue', customer_mix.new_revenue,
      'returning_revenue', customer_mix.returning_revenue,
      'returning_revenue_share', case
        when customer_mix.new_revenue + customer_mix.returning_revenue > 0
          then (customer_mix.returning_revenue / (customer_mix.new_revenue + customer_mix.returning_revenue)) * 100
        else 0
      end
    ),
    'profitability', jsonb_build_object(
      'channels', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'key', item.key,
              'label', item.label,
              'orders', item.orders,
              'sales', item.sales,
              'cogs', item.cogs,
              'profit', item.profit,
              'margin', item.margin
            )
          )
          from profitability_channel item
        ),
        '[]'::jsonb
      ),
      'payment_methods', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'key', item.key,
              'label', item.label,
              'orders', item.orders,
              'sales', item.sales,
              'cogs', item.cogs,
              'profit', item.profit,
              'margin', item.margin
            )
          )
          from profitability_payment item
        ),
        '[]'::jsonb
      )
    )
  )
  into v_result
  from funnel_summary, sell_through_summary, customer_mix;

  return v_result;
end;
$$;

revoke execute on function public.fn_admin_growth_analytics(date, date, integer) from public;
grant execute on function public.fn_admin_growth_analytics(date, date, integer) to authenticated;
