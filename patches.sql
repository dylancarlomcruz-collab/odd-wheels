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

-- Cart add-ons
alter table public.cart_items
  add column if not exists protector_selected boolean not null default false;

-- Shipping workflow patches

alter table public.settings
  add column if not exists header_logo_url text;

alter table public.settings
  add column if not exists free_shipping_threshold numeric not null default 0;

alter table public.settings
  add column if not exists protector_stock int not null default 0;

alter table public.settings
  add column if not exists protector_stock_mainline int not null default 0,
  add column if not exists protector_stock_premium int not null default 0;

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

-- Bug reports
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

alter table public.bug_reports enable row level security;

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

-- Hotfix: ensure order expiry columns exist for cancellation/expiry flows.
alter table public.orders
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz;

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
set row_security = off
as $$
declare
  v_product_ids uuid[];
  v_cancel_ids uuid[];
  v_returned int := 0;
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
    and (
      oi.variant_id = any(p_variant_ids)
      or oi.item_id = any(p_variant_ids)
      or (
        oi.variant_id is null
        and oi.item_id is null
        and oi.product_id = any(v_product_ids)
      )
    );

  if v_cancel_ids is not null then
    update public.orders
      set status = 'CANCELLED',
          cancelled_reason = 'SOLD_OUT'
    where id = any(v_cancel_ids);

    update public.order_items
      set is_cancelled = true,
          cancel_reason = 'SOLD_OUT'
    where order_id = any(v_cancel_ids)
      and (
        variant_id = any(p_variant_ids)
        or item_id = any(p_variant_ids)
        or (
          variant_id is null
          and item_id is null
          and product_id = any(v_product_ids)
        )
      );

    with canceled_orders as (
      select id, user_id
      from public.orders
      where id = any(v_cancel_ids)
    ),
    remaining as (
      select o.user_id, oi.variant_id, sum(oi.qty) as qty
      from public.order_items oi
      join canceled_orders o on o.id = oi.order_id
      where not (
        oi.variant_id = any(p_variant_ids)
        or oi.item_id = any(p_variant_ids)
        or (
          oi.variant_id is null
          and oi.item_id is null
          and oi.product_id = any(v_product_ids)
        )
      )
        and coalesce(oi.is_cancelled, false) = false
        and coalesce(oi.cancel_reason, '') <> 'SOLD_OUT'
      group by o.user_id, oi.variant_id
    ),
    stock as (
      select r.user_id, r.variant_id, least(r.qty, pv.qty) as qty
      from remaining r
      join public.product_variants pv on pv.id = r.variant_id
      where pv.qty > 0
    ),
    upserted as (
      insert into public.cart_items (user_id, variant_id, qty)
      select s.user_id, s.variant_id, s.qty
      from stock s
      where s.qty > 0
      on conflict (user_id, variant_id) do update
        set qty = least(
          public.cart_items.qty + excluded.qty,
          (select pv.qty from public.product_variants pv where pv.id = excluded.variant_id)
        )
      returning 1
    )
    select count(*) into v_returned from upserted;
  end if;

  return jsonb_build_object(
    'ok', true,
    'variant_count', array_length(p_variant_ids, 1),
    'cancelled_orders', coalesce(array_length(v_cancel_ids, 1), 0),
    'returned_cart_lines', v_returned
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

drop function if exists public.fn_staff_approve_order(uuid);
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

-- Sale pricing support for variants
alter table public.product_variants
  add column if not exists sale_price numeric,
  add column if not exists discount_percent numeric;

alter table public.product_variants
  drop constraint if exists product_variants_condition_check;

alter table public.product_variants
  drop constraint if exists product_variants_ship_class_check;

update public.product_variants
  set condition = 'unsealed',
      ship_class = 'DIORAMA'
where condition = 'diorama';

alter table public.product_variants
  add constraint product_variants_condition_check
  check (
    condition in (
      'sealed',
      'resealed',
      'near_mint',
      'unsealed',
      'with_issues',
      'blistered',
      'sealed_blister',
      'unsealed_blister'
    )
  );

alter table public.product_variants
  add constraint product_variants_ship_class_check
  check (ship_class in ('MINI_GT','KAIDO','POPRACE','ACRYLIC_TRUE_SCALE','TRUCKS','BLISTER','TOMICA','HOT_WHEELS_MAINLINE','HOT_WHEELS_PREMIUM','LOOSE_NO_BOX','LALAMOVE','DIORAMA'));

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

create table if not exists public.product_clicks (
  product_id uuid primary key references public.products(id) on delete cascade,
  clicks integer not null default 0,
  auth_clicks integer not null default 0,
  guest_clicks integer not null default 0,
  last_clicked_at timestamptz not null default now()
);

alter table public.product_clicks
  add column if not exists auth_clicks integer not null default 0,
  add column if not exists guest_clicks integer not null default 0;

alter table public.product_clicks enable row level security;

drop policy if exists "product clicks read" on public.product_clicks;
create policy "product clicks read" on public.product_clicks
for select using (true);

create or replace function public.increment_product_click(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.product_clicks (
    product_id,
    clicks,
    auth_clicks,
    guest_clicks,
    last_clicked_at
  )
  values (
    p_product_id,
    1,
    case when auth.uid() is not null then 1 else 0 end,
    case when auth.uid() is null then 1 else 0 end,
    now()
  )
  on conflict (product_id)
  do update set
    clicks = public.product_clicks.clicks + 1,
    auth_clicks = public.product_clicks.auth_clicks
      + case when auth.uid() is not null then 1 else 0 end,
    guest_clicks = public.product_clicks.guest_clicks
      + case when auth.uid() is null then 1 else 0 end,
    last_clicked_at = now();
end;
$$;

grant execute on function public.increment_product_click(uuid) to anon, authenticated;

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

-- Marketing analytics + search utilities

create table if not exists public.product_add_to_cart (
  product_id uuid primary key references public.products(id) on delete cascade,
  adds integer not null default 0,
  auth_adds integer not null default 0,
  guest_adds integer not null default 0,
  last_added_at timestamptz not null default now()
);

alter table public.product_add_to_cart
  add column if not exists auth_adds integer not null default 0,
  add column if not exists guest_adds integer not null default 0;

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
  insert into public.product_add_to_cart (
    product_id,
    adds,
    auth_adds,
    guest_adds,
    last_added_at
  )
  values (
    p_product_id,
    1,
    case when auth.uid() is not null then 1 else 0 end,
    case when auth.uid() is null then 1 else 0 end,
    now()
  )
  on conflict (product_id)
  do update set
    adds = public.product_add_to_cart.adds + 1,
    auth_adds = public.product_add_to_cart.auth_adds
      + case when auth.uid() is not null then 1 else 0 end,
    guest_adds = public.product_add_to_cart.guest_adds
      + case when auth.uid() is null then 1 else 0 end,
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
begin
  if coalesce(old.qty, 0) <= 0 and coalesce(new.qty, 0) > 0 then
    insert into public.product_restock_events (product_id, variant_id, prev_qty, new_qty, restocked_at)
    values (new.product_id, new.id, coalesce(old.qty, 0), new.qty, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_variants_restock on public.product_variants;
create trigger trg_product_variants_restock
after update of qty on public.product_variants
for each row execute procedure public.fn_log_restock_event();

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

-- Tier + Shipping Voucher system

alter table public.profiles
  add column if not exists lifetime_spend numeric not null default 0,
  add column if not exists tier text not null default 'CLASSIC',
  add column if not exists tier_updated_at timestamptz not null default now();

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  title text,
  kind text not null default 'FREE_SHIPPING',
  min_subtotal numeric not null default 0,
  shipping_cap numeric not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  max_per_user int,
  max_redemptions int,
  created_at timestamptz not null default now()
);

create table if not exists public.voucher_wallet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  status text not null default 'AVAILABLE',
  claimed_at timestamptz not null default now(),
  used_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  expires_at timestamptz,
  unique (user_id, voucher_id, expires_at)
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists voucher_id uuid references public.vouchers(id),
  add column if not exists shipping_discount numeric not null default 0,
  add column if not exists discount_total numeric not null default 0,
  add column if not exists priority_level text not null default 'NORMAL';

alter table public.vouchers enable row level security;
alter table public.voucher_wallet enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "auth read active vouchers" on public.vouchers;
create policy "auth read active vouchers" on public.vouchers
for select using (auth.uid() is not null and (is_active = true or public.is_admin()));

drop policy if exists "admin manage vouchers" on public.vouchers;
create policy "admin manage vouchers" on public.vouchers
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user read own voucher wallet" on public.voucher_wallet;
create policy "user read own voucher wallet" on public.voucher_wallet
for select using (auth.uid() = user_id);

drop policy if exists "admin manage voucher wallet" on public.voucher_wallet;
create policy "admin manage voucher wallet" on public.voucher_wallet
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user read own order events" on public.order_events;
create policy "user read own order events" on public.order_events
for select using (
  exists (
    select 1 from public.orders o
    where o.id = order_events.order_id
      and o.user_id = auth.uid()
  )
);

drop policy if exists "staff read order events" on public.order_events;
create policy "staff read order events" on public.order_events
for select using (public.is_staff());

create or replace function public.fn_tier_from_spend(p_spend numeric)
returns text
language plpgsql
as $$
begin
  if coalesce(p_spend, 0) >= 10000 then
    return 'PLATINUM';
  elsif coalesce(p_spend, 0) >= 5000 then
    return 'GOLD';
  elsif coalesce(p_spend, 0) >= 2000 then
    return 'SILVER';
  else
    return 'CLASSIC';
  end if;
end;
$$;

-- Visitor sessions + per-visitor click/cart tracking

create table if not exists public.user_product_clicks (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  clicks integer not null default 0,
  last_clicked_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.guest_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);

create table if not exists public.guest_product_clicks (
  session_id uuid not null references public.guest_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  clicks integer not null default 0,
  last_clicked_at timestamptz not null default now(),
  primary key (session_id, product_id)
);

create table if not exists public.guest_cart_items (
  session_id uuid not null references public.guest_sessions(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  qty integer not null default 1,
  protector_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, variant_id)
);

create index if not exists idx_user_product_clicks_user
  on public.user_product_clicks (user_id);

create index if not exists idx_guest_cart_items_session
  on public.guest_cart_items (session_id);

create index if not exists idx_guest_product_clicks_session
  on public.guest_product_clicks (session_id);

alter table public.user_product_clicks enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.guest_product_clicks enable row level security;
alter table public.guest_cart_items enable row level security;

drop policy if exists "admin read user product clicks" on public.user_product_clicks;
create policy "admin read user product clicks" on public.user_product_clicks
for select using (public.is_admin());

drop policy if exists "admin read guest sessions" on public.guest_sessions;
create policy "admin read guest sessions" on public.guest_sessions
for select using (public.is_admin());

drop policy if exists "admin read guest product clicks" on public.guest_product_clicks;
create policy "admin read guest product clicks" on public.guest_product_clicks
for select using (public.is_admin());

drop policy if exists "admin read guest cart items" on public.guest_cart_items;
create policy "admin read guest cart items" on public.guest_cart_items
for select using (public.is_admin());

create or replace function public.upsert_guest_session(
  p_session_id uuid,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_agent text;
begin
  v_id := coalesce(p_session_id, gen_random_uuid());
  v_agent := nullif(trim(coalesce(p_user_agent, '')), '');

  insert into public.guest_sessions (id, user_agent, last_seen_at)
  values (v_id, v_agent, now())
  on conflict (id) do update
    set last_seen_at = now(),
        user_agent = coalesce(public.guest_sessions.user_agent, excluded.user_agent);

  return v_id;
end;
$$;

revoke execute on function public.upsert_guest_session(uuid, text) from public;
grant execute on function public.upsert_guest_session(uuid, text) to anon, authenticated;

create or replace function public.sync_guest_cart(
  p_session_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int := 0;
begin
  if p_session_id is null then
    raise exception 'Session id required.';
  end if;

  perform public.upsert_guest_session(p_session_id, null);

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    delete from public.guest_cart_items where session_id = p_session_id;
    return jsonb_build_object('ok', true, 'lines', 0);
  end if;

  with raw as (
    select
      (value->>'variant_id')::uuid as variant_id,
      greatest(1, (value->>'qty')::int) as qty,
      coalesce((value->>'protector_selected')::boolean, false) as protector_selected
    from jsonb_array_elements(p_items) as value
    where (value->>'variant_id') is not null
  ),
  items as (
    select
      variant_id,
      sum(qty)::int as qty,
      bool_or(protector_selected) as protector_selected
    from raw
    where variant_id is not null
    group by variant_id
  ),
  upserted as (
    insert into public.guest_cart_items (
      session_id,
      variant_id,
      qty,
      protector_selected,
      updated_at
    )
    select p_session_id, variant_id, qty, protector_selected, now()
    from items
    on conflict (session_id, variant_id) do update
      set qty = excluded.qty,
          protector_selected = excluded.protector_selected,
          updated_at = now()
    returning 1
  )
  select count(*) into v_count from upserted;

  delete from public.guest_cart_items
  where session_id = p_session_id
    and variant_id not in (select variant_id from items);

  return jsonb_build_object('ok', true, 'lines', v_count);
end;
$$;

revoke execute on function public.sync_guest_cart(uuid, jsonb) from public;
grant execute on function public.sync_guest_cart(uuid, jsonb) to anon, authenticated;

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

  insert into public.product_clicks (
    product_id,
    clicks,
    auth_clicks,
    guest_clicks,
    last_clicked_at
  )
  values (
    p_product_id,
    1,
    case when v_user_id is not null then 1 else 0 end,
    case when v_user_id is null then 1 else 0 end,
    now()
  )
  on conflict (product_id)
  do update set
    clicks = public.product_clicks.clicks + 1,
    auth_clicks = public.product_clicks.auth_clicks
      + case when v_user_id is not null then 1 else 0 end,
    guest_clicks = public.product_clicks.guest_clicks
      + case when v_user_id is null then 1 else 0 end,
    last_clicked_at = now();

  if v_user_id is not null then
    insert into public.user_product_clicks (
      user_id,
      product_id,
      clicks,
      last_clicked_at
    )
    values (v_user_id, p_product_id, 1, now())
    on conflict (user_id, product_id) do update
      set clicks = public.user_product_clicks.clicks + 1,
          last_clicked_at = now();
  else
    if p_session_id is null then
      return;
    end if;
    perform public.upsert_guest_session(p_session_id, null);
    insert into public.guest_product_clicks (
      session_id,
      product_id,
      clicks,
      last_clicked_at
    )
    values (p_session_id, p_product_id, 1, now())
    on conflict (session_id, product_id) do update
      set clicks = public.guest_product_clicks.clicks + 1,
          last_clicked_at = now();
  end if;
end;
$$;

revoke execute on function public.increment_product_click_detailed(uuid, uuid) from public;
grant execute on function public.increment_product_click_detailed(uuid, uuid) to anon, authenticated;

-- Announcements pinning
alter table public.announcements
  add column if not exists pinned boolean not null default false;

-- Bug reports (menu)

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

alter table public.bug_reports enable row level security;

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

-- Announcements

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

alter table public.announcements enable row level security;

drop policy if exists "public read active announcements" on public.announcements;
create policy "public read active announcements" on public.announcements
for select using (is_active = true);

drop policy if exists "staff read announcements" on public.announcements;
create policy "staff read announcements" on public.announcements
for select using (public.is_staff());

drop policy if exists "admin manage announcements" on public.announcements;
create policy "admin manage announcements" on public.announcements
for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.fn_recalculate_profile_tier(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spend numeric;
  v_tier text;
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;

  select coalesce(sum(total), 0)
  into v_spend
  from public.orders
  where user_id = p_user_id
    and payment_status = 'PAID';

  v_tier := public.fn_tier_from_spend(v_spend);

  update public.profiles
    set lifetime_spend = v_spend,
        tier = v_tier,
        tier_updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true, 'lifetime_spend', v_spend, 'tier', v_tier);
end;
$$;

alter table public.profiles
  alter column tier set default 'CLASSIC';

update public.profiles
  set tier = public.fn_tier_from_spend(lifetime_spend),
      tier_updated_at = now();

create or replace function public.fn_sync_profile_tier_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.payment_status = 'PAID')
     or (tg_op = 'UPDATE' and new.payment_status = 'PAID' and old.payment_status is distinct from new.payment_status) then
    perform public.fn_recalculate_profile_tier(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_paid_sync on public.orders;
create trigger trg_orders_paid_sync
after insert or update of payment_status on public.orders
for each row execute procedure public.fn_sync_profile_tier_on_paid();

create or replace function public.fn_apply_order_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_voucher public.vouchers%rowtype;
  v_discount numeric := 0;
  v_now timestamptz := now();
  v_tier text;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  select p.tier into v_tier from public.profiles p where p.id = new.user_id;
  if coalesce(v_tier, 'SILVER') = 'PLATINUM' then
    new.priority_level := 'PRIORITY';
  else
    new.priority_level := 'NORMAL';
  end if;

  new.shipping_discount := 0;
  new.discount_total := 0;

  if new.voucher_id is null then
    new.total := coalesce(new.subtotal, 0)
      + coalesce(new.shipping_fee, 0)
      + coalesce(new.cop_fee, 0)
      + coalesce(new.lalamove_fee, 0)
      + coalesce(new.priority_fee, 0)
      + coalesce(new.insurance_fee, 0);
    return new;
  end if;

  if coalesce(new.shipping_fee, 0) <= 0 then
    raise exception 'Voucher not eligible for zero shipping fee.';
  end if;

  select * into v_voucher
  from public.vouchers
  where id = new.voucher_id
    and is_active = true;

  if not found then
    raise exception 'Voucher unavailable.';
  end if;

  if coalesce(v_voucher.kind, '') <> 'FREE_SHIPPING' then
    raise exception 'Voucher type not supported.';
  end if;

  if v_voucher.starts_at is not null and v_voucher.starts_at > v_now then
    raise exception 'Voucher not active yet.';
  end if;

  if v_voucher.expires_at is not null and v_voucher.expires_at < v_now then
    raise exception 'Voucher expired.';
  end if;

  if coalesce(new.subtotal, 0) < coalesce(v_voucher.min_subtotal, 0) then
    raise exception 'Subtotal does not meet voucher minimum.';
  end if;

  v_discount := least(
    coalesce(new.shipping_fee, 0),
    coalesce(v_voucher.shipping_cap, 0)
  );

  new.shipping_discount := v_discount;
  new.discount_total := v_discount;
  new.total := coalesce(new.subtotal, 0)
    + coalesce(new.shipping_fee, 0)
    + coalesce(new.cop_fee, 0)
    + coalesce(new.lalamove_fee, 0)
    + coalesce(new.priority_fee, 0)
    + coalesce(new.insurance_fee, 0)
    - v_discount;

  return new;
end;
$$;

drop trigger if exists trg_orders_apply_voucher on public.orders;
create trigger trg_orders_apply_voucher
before insert on public.orders
for each row execute procedure public.fn_apply_order_voucher();

create or replace function public.fn_attach_voucher_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_now timestamptz := now();
begin
  if new.voucher_id is null then
    return new;
  end if;

  update public.voucher_wallet
    set status = 'USED',
        used_at = v_now,
        order_id = new.id
  where id = (
    select vw.id
    from public.voucher_wallet vw
    where vw.user_id = new.user_id
      and vw.voucher_id = new.voucher_id
      and vw.status = 'AVAILABLE'
      and (vw.expires_at is null or vw.expires_at >= v_now)
    order by vw.expires_at nulls last, vw.claimed_at
    for update skip locked
    limit 1
  );

  if not found then
    raise exception 'Voucher not available.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_attach_voucher on public.orders;
create trigger trg_orders_attach_voucher
after insert on public.orders
for each row execute procedure public.fn_attach_voucher_wallet();

create or replace function public.fn_log_order_events()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, event_type, message)
    values (new.id, 'CREATED', 'Order placed');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status = 'AWAITING_PAYMENT' then
      insert into public.order_events (order_id, event_type, message)
      values (new.id, 'APPROVED', 'Order approved');
    end if;

    if new.shipping_status is distinct from old.shipping_status then
      if new.shipping_status in ('PREPARING', 'PREPARING TO SHIP', 'TO_SHIP', 'PENDING_SHIPMENT') then
        insert into public.order_events (order_id, event_type, message)
        values (new.id, 'PACKED', 'Order packed');
      elsif new.shipping_status = 'SHIPPED' then
        insert into public.order_events (order_id, event_type, message)
        values (new.id, 'SHIPPED', 'Order shipped');
      elsif new.shipping_status in ('COMPLETED', 'DELIVERED') then
        insert into public.order_events (order_id, event_type, message)
        values (new.id, 'DELIVERED', 'Order delivered');
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_events_insert on public.orders;
create trigger trg_order_events_insert
after insert on public.orders
for each row execute procedure public.fn_log_order_events();

drop trigger if exists trg_order_events_update on public.orders;
create trigger trg_order_events_update
after update on public.orders
for each row execute procedure public.fn_log_order_events();

create or replace function public.fn_auto_approve_order(p_order_id uuid)
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
  v_tier text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if v_order.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select p.tier into v_tier from public.profiles p where p.id = v_order.user_id;
  if coalesce(v_tier, 'SILVER') not in ('GOLD', 'PLATINUM') then
    return jsonb_build_object('ok', true, 'eligible', false, 'order_id', p_order_id);
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
  values (auth.uid(), 'ORDER_AUTO_APPROVED', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('ok', true, 'eligible', true, 'order_id', p_order_id);
end;
$$;

revoke execute on function public.fn_auto_approve_order(uuid) from public;
grant execute on function public.fn_auto_approve_order(uuid) to authenticated;

create or replace function public.fn_expire_voucher_wallet()
  returns int
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
declare
  v_count int := 0;
begin
  update public.voucher_wallet
    set status = 'EXPIRED'
  where status = 'AVAILABLE'
    and expires_at is not null
    and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
  end;
  $$;

drop function if exists public.fn_grant_monthly_vouchers(timestamptz);

create or replace function public.fn_grant_spend_vouchers(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_spend numeric := 0;
  v_fs100 uuid;
  v_fs200 uuid;
  v_fs300 uuid;
  v_existing int := 0;
  v_earned int := 0;
  v_added int := 0;
  v_total int := 0;
begin
  if p_user_id is null then
    raise exception 'User id required';
  end if;

  select coalesce(sum(total), 0)
    into v_spend
  from public.orders
  where user_id = p_user_id
    and payment_status = 'PAID';

  select id into v_fs100 from public.vouchers where code = 'FS100' limit 1;
  select id into v_fs200 from public.vouchers where code = 'FS200' limit 1;
  select id into v_fs300 from public.vouchers where code = 'FS300' limit 1;

  if v_fs100 is not null then
    v_earned := floor(v_spend / 2000)::int;
    select count(*) into v_existing
      from public.voucher_wallet
      where user_id = p_user_id
        and voucher_id = v_fs100
        and coalesce(status, 'AVAILABLE') <> 'EXPIRED';
    if v_earned > v_existing then
      insert into public.voucher_wallet (user_id, voucher_id)
      select p_user_id, v_fs100 from generate_series(1, v_earned - v_existing);
      get diagnostics v_added = row_count;
      v_total := v_total + v_added;
    end if;
  end if;

  if v_fs200 is not null then
    v_earned := floor(v_spend / 4000)::int;
    select count(*) into v_existing
      from public.voucher_wallet
      where user_id = p_user_id
        and voucher_id = v_fs200
        and coalesce(status, 'AVAILABLE') <> 'EXPIRED';
    if v_earned > v_existing then
      insert into public.voucher_wallet (user_id, voucher_id)
      select p_user_id, v_fs200 from generate_series(1, v_earned - v_existing);
      get diagnostics v_added = row_count;
      v_total := v_total + v_added;
    end if;
  end if;

  if v_fs300 is not null then
    v_earned := floor(v_spend / 10000)::int;
    select count(*) into v_existing
      from public.voucher_wallet
      where user_id = p_user_id
        and voucher_id = v_fs300
        and coalesce(status, 'AVAILABLE') <> 'EXPIRED';
    if v_earned > v_existing then
      insert into public.voucher_wallet (user_id, voucher_id)
      select p_user_id, v_fs300 from generate_series(1, v_earned - v_existing);
      get diagnostics v_added = row_count;
      v_total := v_total + v_added;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'granted', v_total, 'lifetime_spend', v_spend);
end;
$$;

create or replace function public.fn_grant_spend_vouchers_for_all()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row record;
  v_total int := 0;
  v_granted int := 0;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  for v_row in select id from public.profiles loop
    v_result := public.fn_grant_spend_vouchers(v_row.id);
    v_granted := v_granted + coalesce((v_result->>'granted')::int, 0);
    v_total := v_total + 1;
  end loop;

  return jsonb_build_object('ok', true, 'users', v_total, 'granted', v_granted);
end;
$$;

create or replace function public.fn_sync_profile_vouchers_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.payment_status = 'PAID')
     or (tg_op = 'UPDATE' and new.payment_status = 'PAID' and old.payment_status is distinct from new.payment_status) then
    perform public.fn_grant_spend_vouchers(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_paid_vouchers on public.orders;
create trigger trg_orders_paid_vouchers
after insert or update of payment_status on public.orders
for each row execute procedure public.fn_sync_profile_vouchers_on_paid();

revoke execute on function public.fn_grant_spend_vouchers(uuid) from public;
revoke execute on function public.fn_grant_spend_vouchers_for_all() from public;
grant execute on function public.fn_grant_spend_vouchers_for_all() to authenticated;

insert into public.vouchers (code, title, kind, min_subtotal, shipping_cap, is_active)
values
  ('FS100', 'Free Shipping 100', 'FREE_SHIPPING', 2000, 100, true),
  ('FS200', 'Free Shipping 200', 'FREE_SHIPPING', 4000, 200, true),
  ('FS300', 'Free Shipping 300', 'FREE_SHIPPING', 10000, 300, true)
on conflict (code) do update
  set title = excluded.title,
      kind = excluded.kind,
      min_subtotal = excluded.min_subtotal,
      shipping_cap = excluded.shipping_cap,
      is_active = excluded.is_active;

create or replace function public.fn_tier_from_spend(p_spend numeric)
returns text
language plpgsql
as $$
begin
  if coalesce(p_spend, 0) >= 10000 then
    return 'PLATINUM';
  elsif coalesce(p_spend, 0) >= 5000 then
    return 'GOLD';
  elsif coalesce(p_spend, 0) >= 2000 then
    return 'SILVER';
  else
    return 'CLASSIC';
  end if;
end;
$$;
