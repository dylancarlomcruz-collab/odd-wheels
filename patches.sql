-- Sell / trade uploads bucket (top-most policies)
insert into storage.buckets (id, name, public)
values ('sell-trade-uploads', 'sell-trade-uploads', true)
on conflict (id) do nothing;

drop policy if exists "sell trade uploads read" on storage.objects;
create policy "sell trade uploads read" on storage.objects
for select using (bucket_id = 'sell-trade-uploads');

drop policy if exists "sell trade uploads insert" on storage.objects;
create policy "sell trade uploads insert" on storage.objects
for insert with check (bucket_id = 'sell-trade-uploads' and auth.role() = 'authenticated');

-- Shipping workflow patches

alter table public.settings
  add column if not exists header_logo_url text;

alter table public.orders
  add column if not exists shipping_status text not null default 'PREPARING TO SHIP';

alter table public.orders
  add column if not exists tracking_number text;

alter table public.orders
  add column if not exists courier text;

alter table public.orders
  add column if not exists shipped_at timestamptz;

alter table public.orders
  add column if not exists completed_at timestamptz;

alter table public.orders
  add column if not exists rush_fee numeric not null default 0;

create or replace function public.fn_set_shipping_preparing(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.payment_status <> 'PAID' then
    raise exception 'Order is not paid.';
  end if;

  update public.orders
    set shipping_status = 'PREPARING TO SHIP'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

-- Admin inventory valuation
create or replace function public.fn_admin_inventory_valuation(include_archived boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units bigint;
  v_cost numeric;
  v_retail numeric;
  v_missing int;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select
    coalesce(sum(pv.qty), 0),
    coalesce(sum(pv.qty * coalesce(pv.cost, 0)), 0),
    coalesce(sum(pv.qty * pv.price), 0),
    coalesce(sum(case when pv.cost is null then 1 else 0 end), 0)
  into v_units, v_cost, v_retail, v_missing
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.qty > 0
    and (include_archived or p.is_active = true);

  return jsonb_build_object(
    'units', v_units,
    'cost_value', v_cost,
    'retail_value', v_retail,
    'missing_cost_variants', v_missing
  );
end;
$$;

revoke execute on function public.fn_admin_inventory_valuation(boolean) from public;
grant execute on function public.fn_admin_inventory_valuation(boolean) to authenticated;

create or replace function public.fn_mark_shipped(
  p_order_id uuid,
  p_courier text,
  p_tracking_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_tracking text;
  v_courier text;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.payment_status <> 'PAID' then
    raise exception 'Order is not paid.';
  end if;

  v_tracking := nullif(trim(coalesce(p_tracking_number, '')), '');
  if v_tracking is null then
    raise exception 'Tracking number is required.';
  end if;

  v_courier := nullif(trim(coalesce(p_courier, '')), '');
  if v_courier is null then
    v_courier := v_order.shipping_method;
  end if;

  update public.orders
    set shipping_status = 'SHIPPED',
        courier = v_courier,
        tracking_number = v_tracking,
        shipped_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

create or replace function public.fn_mark_completed_staff(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.payment_status <> 'PAID' then
    raise exception 'Order is not paid.';
  end if;

  update public.orders
    set shipping_status = 'COMPLETED',
        completed_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

create or replace function public.fn_confirm_received_customer(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if v_order.shipping_status <> 'SHIPPED' then
    raise exception 'Order is not in shipped status.';
  end if;

  update public.orders
    set shipping_status = 'COMPLETED',
        completed_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

create or replace function public.fn_add_rush_fee(
  p_order_id uuid,
  p_amount numeric default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_amount numeric;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  v_amount := coalesce(p_amount, 50);
  if v_amount <= 0 then
    raise exception 'Invalid rush fee amount.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.rush_fee > 0 then
    return jsonb_build_object(
      'ok', true,
      'order_id', p_order_id,
      'already_added', true,
      'rush_fee', v_order.rush_fee,
      'total', v_order.total
    );
  end if;

  update public.orders
    set rush_fee = v_amount,
        total = total + v_amount
  where id = p_order_id
    and rush_fee = 0;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'rush_fee', v_amount,
    'total', v_order.total + v_amount
  );
end;
$$;

revoke execute on function public.fn_set_shipping_preparing(uuid) from public;
revoke execute on function public.fn_mark_shipped(uuid, text, text) from public;
revoke execute on function public.fn_mark_completed_staff(uuid) from public;
revoke execute on function public.fn_confirm_received_customer(uuid) from public;
revoke execute on function public.fn_add_rush_fee(uuid, numeric) from public;

grant execute on function public.fn_set_shipping_preparing(uuid) to authenticated;
grant execute on function public.fn_mark_shipped(uuid, text, text) to authenticated;
grant execute on function public.fn_mark_completed_staff(uuid) to authenticated;
grant execute on function public.fn_confirm_received_customer(uuid) to authenticated;
grant execute on function public.fn_add_rush_fee(uuid, numeric) to authenticated;

-- Inventory timeouts + sold-out handling

alter table public.orders
  add column if not exists cancelled_reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists inventory_deducted boolean not null default false,
  add column if not exists reserved_expires_at timestamptz,
  add column if not exists payment_deadline timestamptz,
  add column if not exists payment_hold boolean not null default false;

update public.orders
  set expires_at = coalesce(expires_at, reserved_expires_at, payment_deadline)
where expires_at is null
  and (reserved_expires_at is not null or payment_deadline is not null);

alter table public.order_items
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cancel_reason text;

alter table public.products
  add column if not exists archived_reason text;

create index if not exists idx_orders_expires_at_open
  on public.orders (expires_at)
  where expired_at is null;

create index if not exists idx_order_items_variant
  on public.order_items (variant_id);

create or replace function public.fn_cleanup_sold_out_variants(p_variant_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_ids uuid[];
  v_cancel_ids uuid[];
begin
  if p_variant_ids is null or array_length(p_variant_ids, 1) is null then
    return jsonb_build_object('ok', true, 'variant_count', 0);
  end if;

  select array_agg(distinct pv.product_id)
  into v_product_ids
  from public.product_variants pv
  where pv.id = any(p_variant_ids);

  if v_product_ids is not null then
    update public.products
      set is_active = false,
          archived_reason = coalesce(archived_reason, 'SOLD_OUT')
    where id = any(v_product_ids);
  end if;

  delete from public.cart_items where variant_id = any(p_variant_ids);

  select array_agg(distinct o.id)
  into v_cancel_ids
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status not in ('CANCELLED','VOIDED')
    and o.payment_status <> 'PAID'
    and coalesce(o.inventory_deducted, false) = false
    and oi.variant_id = any(p_variant_ids);

  if v_cancel_ids is not null then
    update public.orders
      set status = 'CANCELLED',
          cancelled_reason = 'SOLD_OUT'
    where id = any(v_cancel_ids);

    update public.order_items
      set is_cancelled = true,
          cancel_reason = 'SOLD_OUT'
    where order_id = any(v_cancel_ids)
      and variant_id = any(p_variant_ids);
  end if;

  return jsonb_build_object(
    'ok', true,
    'variant_count', array_length(p_variant_ids, 1),
    'cancelled_orders', coalesce(array_length(v_cancel_ids, 1), 0)
  );
end;
$$;

create or replace function public.fn_customer_reorder_remaining(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_added int := 0;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  with remaining as (
    select oi.variant_id, greatest(1, oi.qty) as qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.is_cancelled, false) = false
      and coalesce(oi.cancel_reason, '') <> 'SOLD_OUT'
  ),
  stock as (
    select r.variant_id, least(r.qty, pv.qty) as qty
    from remaining r
    join public.product_variants pv on pv.id = r.variant_id
    where pv.qty > 0
  ),
  upserted as (
    insert into public.cart_items (user_id, variant_id, qty)
    select auth.uid(), s.variant_id, s.qty
    from stock s
    on conflict (user_id, variant_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select pv.qty from public.product_variants pv where pv.id = excluded.variant_id)
      )
    returning 1
  )
  select count(*) into v_added from upserted;

  return jsonb_build_object('ok', true, 'added_lines', v_added);
end;
$$;

create or replace function public.fn_suggest_similar_products(
  p_variant_ids uuid[],
  p_limit int default 6
)
returns table (
  product_id uuid,
  variant_id uuid,
  title text,
  brand text,
  model text,
  image_urls text[],
  price numeric,
  qty int
)
language sql
security definer
set search_path = public
as $$
  with sold as (
    select distinct pv.id as variant_id, p.id as product_id, p.title, p.brand, p.model
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = any(p_variant_ids)
  ),
  tokens as (
    select distinct lower(token) as token
    from sold,
      unnest(regexp_split_to_array(coalesce(sold.title, '') || ' ' || coalesce(sold.model, ''), '\s+')) as token
    where length(token) >= 3
  ),
  brands as (
    select distinct brand from sold where brand is not null
  ),
  candidates as (
    select distinct
      p.id as product_id,
      pv.id as variant_id,
      p.title,
      p.brand,
      p.model,
      p.image_urls,
      pv.price,
      pv.qty,
      p.created_at
    from public.products p
    join public.product_variants pv on pv.product_id = p.id
    where p.is_active = true
      and pv.qty > 0
      and (p_variant_ids is null or pv.id <> all(p_variant_ids))
      and (
        (
          p.brand is not null
          and p.brand = any(select brand from brands)
          and exists (
            select 1 from tokens t
            where p.title ilike '%' || t.token || '%'
               or p.model ilike '%' || t.token || '%'
          )
        )
        or (
          not exists (select 1 from brands)
          and exists (
            select 1 from tokens t
            where p.title ilike '%' || t.token || '%'
               or p.model ilike '%' || t.token || '%'
          )
        )
      )
  )
  select product_id, variant_id, title, brand, model, image_urls, price, qty
  from candidates
  order by created_at desc, qty desc
  limit coalesce(p_limit, 6);
$$;

create or replace function public.fn_expire_unpaid_orders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_count int := 0;
begin
  for v_order in
    select *
    from public.orders
    where payment_status <> 'PAID'
      and status in ('AWAITING_PAYMENT','PAYMENT_SUBMITTED')
      and expires_at is not null
      and expires_at <= now()
      and expired_at is null
      and coalesce(payment_hold, false) = false
    for update
  loop
    if coalesce(v_order.inventory_deducted, false) then
      update public.product_variants pv
        set qty = pv.qty + oi.qty
      from public.order_items oi
      where oi.order_id = v_order.id
        and pv.id = oi.variant_id;

      update public.orders
        set inventory_deducted = false
      where id = v_order.id;
    end if;

    update public.orders
      set status = 'CANCELLED',
          cancelled_reason = 'PAYMENT_TIMEOUT',
          expired_at = now()
    where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  update public.products p
    set is_active = true,
        archived_reason = null
  where p.archived_reason = 'SOLD_OUT'
    and exists (
      select 1 from public.product_variants pv
      where pv.product_id = p.id
        and pv.qty > 0
    );

  return v_count;
end;
$$;

create or replace function public.fn_staff_approve_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_deadline timestamptz;
  v_sold_out uuid[] := '{}';
  v_remaining int;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.status <> 'PENDING_APPROVAL' then
    return jsonb_build_object('ok', true, 'already_processed', true, 'order_id', p_order_id);
  end if;

  if coalesce(v_order.inventory_deducted, false) then
    return jsonb_build_object('ok', true, 'already_deducted', true, 'order_id', p_order_id);
  end if;

  for v_item in
    select variant_id, qty from public.order_items where order_id = p_order_id
  loop
    update public.product_variants
      set qty = qty - v_item.qty
    where id = v_item.variant_id
      and qty >= v_item.qty
    returning qty into v_remaining;

    if not found then
      raise exception 'Insufficient stock for variant %', v_item.variant_id;
    end if;

    if v_remaining <= 0 then
      v_sold_out := array_append(v_sold_out, v_item.variant_id);
    end if;
  end loop;

  v_deadline := now() + interval '12 hours';

  update public.orders
    set status = 'AWAITING_PAYMENT',
        reserved_expires_at = v_deadline,
        payment_deadline = v_deadline,
        expires_at = v_deadline,
        inventory_deducted = true
  where id = p_order_id;

  if array_length(v_sold_out, 1) is not null then
    perform public.fn_cleanup_sold_out_variants(v_sold_out);
  end if;

  insert into public.audit_logs(actor_user_id, action, meta)
  values (auth.uid(), 'ORDER_APPROVED', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

revoke execute on function public.fn_cleanup_sold_out_variants(uuid[]) from public;
revoke execute on function public.fn_customer_reorder_remaining(uuid) from public;
revoke execute on function public.fn_suggest_similar_products(uuid[], int) from public;
revoke execute on function public.fn_expire_unpaid_orders() from public;
revoke execute on function public.fn_staff_approve_order(uuid) from public;

grant execute on function public.fn_customer_reorder_remaining(uuid) to authenticated;
grant execute on function public.fn_suggest_similar_products(uuid[], int) to authenticated;
grant execute on function public.fn_expire_unpaid_orders() to authenticated;
grant execute on function public.fn_staff_approve_order(uuid) to authenticated;
grant execute on function public.fn_expire_unpaid_orders() to service_role;

-- Pickup settings

alter table public.settings
  add column if not exists pickup_schedule_text text,
  add column if not exists pickup_schedule jsonb not null default '{}'::jsonb,
  add column if not exists pickup_unavailable boolean not null default false;

-- Issue photo support for variants
alter table public.product_variants
  add column if not exists issue_photo_urls text[] null,
  add column if not exists public_notes text null;

alter table public.product_variants
  drop constraint if exists product_variants_condition_check;

alter table public.product_variants
  add constraint product_variants_condition_check
  check (
    condition in (
      'sealed',
      'unsealed',
      'with_issues',
      'diorama',
      'blistered',
      'sealed_blister',
      'unsealed_blister'
    )
  );

alter table public.product_variants
  drop constraint if exists product_variants_ship_class_check;

alter table public.product_variants
  add constraint product_variants_ship_class_check
  check (ship_class in ('MINI_GT','KAIDO','POPRACE','ACRYLIC_TRUE_SCALE','BLISTER','LALAMOVE'));

create table if not exists public.barcode_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid null references public.products(id) on delete set null,
  product_title text,
  description text,
  barcode text not null
);

alter table public.barcode_logs enable row level security;

drop policy if exists "barcode logs read" on public.barcode_logs;
create policy "barcode logs read" on public.barcode_logs
for select using (public.is_staff());

drop policy if exists "barcode logs insert" on public.barcode_logs;
create policy "barcode logs insert" on public.barcode_logs
for insert with check (public.is_staff());

update public.settings
  set pickup_schedule_text = coalesce(
        pickup_schedule_text,
        '10:00 AM - 1:00 PM
2:00 PM - 6:00 PM'
      ),
      pickup_schedule = coalesce(
        nullif(pickup_schedule, '{}'::jsonb),
        '{
          "MON": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "TUE": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "WED": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "THU": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "FRI": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "SAT": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"],
          "SUN": ["10:00 AM - 1:00 PM", "2:00 PM - 6:00 PM"]
        }'::jsonb
      )
where id = 1;

-- Customer shipping defaults

create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  username text,
  contact text,
  shipping_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists name text,
  add column if not exists username text,
  add column if not exists contact text,
  add column if not exists shipping_defaults jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.customers
  set shipping_defaults = '{}'::jsonb
where shipping_defaults is null;

alter table public.customers
  alter column shipping_defaults set default '{}'::jsonb,
  alter column shipping_defaults set not null;

insert into public.customers (id, name, username, contact)
select id, full_name, username, contact_number
from public.profiles
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'shipping_defaults'
  ) then
    insert into public.customers (id, name, username, contact, shipping_defaults)
    select id, full_name, username, contact_number, coalesce(shipping_defaults, '{}'::jsonb)
    from public.profiles
    on conflict (id) do update
      set shipping_defaults = excluded.shipping_defaults
      where public.customers.shipping_defaults = '{}'::jsonb;
  end if;
end $$;

create or replace function public.fn_touch_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute procedure public.fn_touch_customers_updated_at();

alter table public.customers enable row level security;

drop policy if exists "read own customer" on public.customers;
create policy "read own customer" on public.customers
for select using (auth.uid() = id);

drop policy if exists "insert own customer" on public.customers;
create policy "insert own customer" on public.customers
for insert with check (auth.uid() = id);

drop policy if exists "update own customer" on public.customers;
create policy "update own customer" on public.customers
for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admin cart insights access
drop policy if exists "admin read cart items" on public.cart_items;
create policy "admin read cart items" on public.cart_items
for select using (public.is_admin());

-- Payment methods (admin editable)

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

-- Order item cost snapshot
alter table public.order_items
  add column if not exists cost_each numeric;

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

-- Sell / trade requests

create table if not exists public.sell_trade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('SELL', 'TRADE')),
  status text not null default 'PENDING',
  customer_name text,
  customer_contact text,
  customer_email text,
  shipping_method text,
  payload jsonb not null default '{}'::jsonb,
  photo_urls text[] not null default '{}',
  desired_items jsonb,
  admin_notes text,
  counter_offer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sell_trade_requests_user
  on public.sell_trade_requests (user_id);

create index if not exists idx_sell_trade_requests_status
  on public.sell_trade_requests (status);

create or replace function public.fn_touch_sell_trade_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sell_trade_requests_updated_at on public.sell_trade_requests;
create trigger trg_sell_trade_requests_updated_at
before update on public.sell_trade_requests
for each row execute procedure public.fn_touch_sell_trade_requests_updated_at();

alter table public.sell_trade_requests enable row level security;

drop policy if exists "read own sell trade requests" on public.sell_trade_requests;
create policy "read own sell trade requests" on public.sell_trade_requests
for select using (auth.uid() = user_id);

drop policy if exists "staff read sell trade requests" on public.sell_trade_requests;
create policy "staff read sell trade requests" on public.sell_trade_requests
for select using (public.is_staff());

drop policy if exists "insert own sell trade requests" on public.sell_trade_requests;
create policy "insert own sell trade requests" on public.sell_trade_requests
for insert with check (auth.uid() = user_id);

drop policy if exists "staff update sell trade requests" on public.sell_trade_requests;
create policy "staff update sell trade requests" on public.sell_trade_requests
for update using (public.is_staff()) with check (public.is_staff());
