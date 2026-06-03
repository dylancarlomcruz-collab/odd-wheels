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

-- Scheduled release support
alter table public.product_variants
  add column if not exists release_at timestamptz;

create index if not exists idx_product_variants_release_at
  on public.product_variants (release_at);

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

drop policy if exists "public read in-stock variants" on public.product_variants;
create policy "public read in-stock variants" on public.product_variants
for select using (qty > 0 and (release_at is null or release_at <= now()));

-- Price charm: round down to prices ending in 9 for display
update public.product_variants
set
  price = case
    when price is null then null
    when price < 9 then price
    else (floor((price - 9) / 10) * 10 + 9)
  end,
  sale_price = case
    when sale_price is null then null
    when sale_price < 9 then sale_price
    else (floor((sale_price - 9) / 10) * 10 + 9)
  end;

-- Shipping workflow patches

alter table public.settings
  add column if not exists order_approval_enabled boolean not null default true;

update public.settings
  set order_approval_enabled = true
where order_approval_enabled is null;

alter table public.settings
  add column if not exists show_prices boolean not null default true,
  add column if not exists allow_add_to_cart boolean not null default true,
  add column if not exists allow_checkout boolean not null default true;

alter table public.settings
  add column if not exists shipping_days text[];

alter table public.settings
  add column if not exists header_logo_url text;

alter table public.settings
  add column if not exists free_shipping_threshold numeric not null default 0;

alter table public.settings
  add column if not exists free_shipping_couriers text[],
  add column if not exists free_shipping_ship_classes text[];

alter table public.settings
  add column if not exists protector_stock int not null default 0;

alter table public.settings
  add column if not exists allowed_couriers text[],
  add column if not exists allowed_lbc_packages text[],
  add column if not exists allowed_jnt_pouches text[];


alter table public.settings
  add column if not exists protector_stock_mainline int not null default 0,
  add column if not exists protector_stock_premium int not null default 0;

alter table public.orders
  add column if not exists shipping_status text not null default 'PREPARING TO SHIP';

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
  add column if not exists discount numeric not null default 0,
  add column if not exists shipping_discount numeric not null default 0,
  add column if not exists discount_total numeric not null default 0,
  add column if not exists priority_level text not null default 'NORMAL',
  add column if not exists inventory_deducted boolean not null default false,
  add column if not exists payment_hold boolean not null default false;

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

alter table public.orders
  add column if not exists priority_requested boolean not null default false,
  add column if not exists priority_fee numeric not null default 0,
  add column if not exists priority_approved boolean not null default false,
  add column if not exists insurance_selected boolean not null default false,
  add column if not exists insurance_fee numeric not null default 0;

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
  primary key (product_id, image_url)
);

create index if not exists idx_product_image_hashes_product
  on public.product_image_hashes (product_id);

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
          order_status = 'CANCELLED',
          shipping_status = 'CANCELLED',
          tracking_number = null,
          courier = null,
          shipped_at = null,
          completed_at = null,
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
  v_order_id uuid;
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
    v_order_id := v_order.id;

    if coalesce(v_order.inventory_deducted, false) then
      update public.product_variants pv
        set qty = pv.qty + oi.qty
      from public.order_items oi
      where oi.order_id = v_order_id
        and pv.id = oi.variant_id;

      update public.orders
        set inventory_deducted = false
      where id = v_order_id;
    end if;

    update public.orders
      set status = 'CANCELLED',
          order_status = 'CANCELLED',
          shipping_status = 'CANCELLED',
          tracking_number = null,
          courier = null,
          shipped_at = null,
          completed_at = null,
          cancelled_reason = 'PAYMENT_TIMEOUT',
          expired_at = now()
    where id = v_order_id;

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
  v_item_variant_id uuid;
  v_item_qty integer;
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
    v_item_variant_id := v_item.variant_id;
    v_item_qty := v_item.qty;

    update public.product_variants
      set qty = qty - v_item_qty
    where id = v_item_variant_id
      and qty >= v_item_qty
    returning qty into v_remaining;

    if not found then
      raise exception 'Insufficient stock for variant %', v_item_variant_id;
    end if;

    if v_remaining <= 0 then
      v_sold_out := array_append(v_sold_out, v_item_variant_id);
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

-- Per-variant shipping restrictions
alter table public.product_variants
  add column if not exists allowed_couriers text[],
  add column if not exists allowed_lbc_packages text[],
  add column if not exists allowed_jnt_pouches text[];

alter table public.product_variants
  drop constraint if exists product_variants_condition_check;

alter table public.product_variants
  drop constraint if exists product_variants_ship_class_check;

update public.product_variants
  set condition = 'unsealed',
      ship_class = 'FIGURES_DIORAMA'
where condition = 'diorama';

update public.product_variants
  set ship_class = 'FIGURES_DIORAMA'
where ship_class = 'DIORAMA';

update public.settings
  set free_shipping_ship_classes = array_replace(
    free_shipping_ship_classes,
    'DIORAMA',
    'FIGURES_DIORAMA'
  )
where free_shipping_ship_classes @> array['DIORAMA'];

update public.vouchers
  set include_ship_classes = array_replace(
    include_ship_classes,
    'DIORAMA',
    'FIGURES_DIORAMA'
  )
where include_ship_classes @> array['DIORAMA'];

update public.vouchers
  set exclude_ship_classes = array_replace(
    exclude_ship_classes,
    'DIORAMA',
    'FIGURES_DIORAMA'
  )
where exclude_ship_classes @> array['DIORAMA'];

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
      'unsealed_incomplete',
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

alter table public.inventory_refresher_seen_items
  drop constraint if exists inventory_refresher_seen_items_condition_check;

alter table public.inventory_refresher_seen_items
  add constraint inventory_refresher_seen_items_condition_check
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
      'unsealed_incomplete',
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
  add column if not exists first_stocked_at timestamptz,
  add column if not exists in_stock_since timestamptz,
  add column if not exists last_stock_added_at timestamptz,
  add column if not exists last_qty_changed_at timestamptz,
  add column if not exists stale_reviewed_at timestamptz;

alter table public.product_variants
  add constraint product_variants_ship_class_check
  check (
    ship_class in (
      'MINI_GT',
      'SMALL_BOX_FIGURE',
      'KAIDO',
      'POPRACE',
      'TARMAC_BOX',
      'ACRYLIC_TRUE_SCALE',
      'TARMAC_ACRYLIC',
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

alter table public.orders
  add column if not exists sales_customer_id uuid references public.sales_customers(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists contact text,
  add column if not exists address text;

create index if not exists idx_orders_sales_customer
  on public.orders (sales_customer_id, created_at desc);

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
  add column if not exists item_id uuid,
  add column if not exists item_name text,
  add column if not exists product_title text,
  add column if not exists price_each numeric,
  add column if not exists cost_each numeric;

-- Order item image snapshot (first product image)
alter table public.order_items
  add column if not exists image_url text;

update public.order_items oi
  set image_url = p.image_urls[1]
from public.products p
where oi.image_url is null
  and oi.product_id = p.id
  and p.image_urls is not null
  and array_length(p.image_urls, 1) is not null;

update public.order_items oi
  set image_url = p.image_urls[1]
from public.product_variants pv
join public.products p on p.id = pv.product_id
where oi.image_url is null
  and oi.variant_id = pv.id
  and p.image_urls is not null
  and array_length(p.image_urls, 1) is not null;

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

drop trigger if exists trg_order_items_cost_each on public.order_items;
create trigger trg_order_items_cost_each
before insert on public.order_items
for each row execute procedure public.fn_set_order_item_cost_each();

drop trigger if exists trg_order_items_image_url on public.order_items;
create trigger trg_order_items_image_url
before insert on public.order_items
for each row execute procedure public.fn_set_order_item_image_url();

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

drop function if exists public.fn_staff_void_order(uuid, text);
create or replace function public.fn_staff_void_order(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if upper(coalesce(v_order.status, '')) in ('VOIDED', 'CANCELLED') then
    return jsonb_build_object('ok', true, 'already_voided', true, 'order_id', p_order_id);
  end if;

  if coalesce(v_order.inventory_deducted, false) then
    with restore as (
      select
        coalesce(oi.variant_id, oi.item_id) as variant_id,
        sum(greatest(coalesce(oi.qty, 0), 0))::int as qty
      from public.order_items oi
      where oi.order_id = p_order_id
        and coalesce(oi.variant_id, oi.item_id) is not null
      group by 1
    )
    update public.product_variants pv
      set qty = pv.qty + restore.qty
    from restore
    where pv.id = restore.variant_id;
  end if;

  update public.orders
    set status = 'VOIDED',
        order_status = 'VOIDED',
        shipping_status = 'VOIDED',
        tracking_number = null,
        courier = null,
        shipped_at = null,
        completed_at = null,
        cancelled_reason = coalesce(v_reason, 'VOIDED_BY_STAFF'),
        inventory_deducted = false
  where id = p_order_id;

  update public.products p
    set is_active = true,
        archived_reason = null
  where p.archived_reason = 'SOLD_OUT'
    and exists (
      select 1
      from public.product_variants pv
      where pv.product_id = p.id
        and pv.qty > 0
    );

  insert into public.audit_logs (actor_user_id, action, meta)
  values (
    auth.uid(),
    'ORDER_VOIDED',
    jsonb_build_object(
      'order_id', p_order_id,
      'reason', coalesce(v_reason, 'VOIDED_BY_STAFF')
    )
  );

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

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
revoke execute on function public.fn_staff_void_order(uuid, text) from public;
grant execute on function public.fn_staff_void_order(uuid, text) to authenticated;

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
      recorded_at,
      meta
    )
    values (
      v_product_id,
      v_variant_id,
      v_new_qty,
      0,
      v_new_qty,
      'initial_stock',
      auth.uid(),
      coalesce(v_last_stock_added_at, v_created_at, v_recorded_at),
      jsonb_build_object(
        'unit_cost_snapshot', greatest(coalesce(new.cost, 0), 0),
        'condition', new.condition,
        'ship_class', new.ship_class
      )
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
    recorded_at,
    meta
  )
  values (
    v_product_id,
    v_variant_id,
    v_delta,
    v_prev_qty,
    v_new_qty,
    v_movement_type,
    auth.uid(),
    v_recorded_at,
    jsonb_build_object(
      'unit_cost_snapshot', greatest(coalesce(new.cost, 0), 0),
      'condition', new.condition,
      'ship_class', new.ship_class
    )
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
  jsonb_build_object(
    'seeded', true,
    'unit_cost_snapshot', greatest(coalesce(pv.cost, 0), 0),
    'condition', pv.condition,
    'ship_class', pv.ship_class
  )
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

-- Tier + Shipping Voucher system

alter table public.profiles
  add column if not exists lifetime_spend numeric not null default 0,
  add column if not exists tier text not null default 'CLASSIC',
  add column if not exists tier_updated_at timestamptz not null default now();

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  title text,
  details text,
  kind text not null default 'FREE_SHIPPING',
  min_subtotal numeric not null default 0,
  shipping_cap numeric not null default 0,
  discount_amount numeric,
  discount_percent numeric,
  include_couriers text[],
  include_ship_classes text[],
  exclude_ship_classes text[],
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  max_per_user int,
  max_redemptions int,
  created_at timestamptz not null default now()
);

alter table public.vouchers
  add column if not exists details text,
  add column if not exists include_couriers text[],
  add column if not exists discount_amount numeric,
  add column if not exists discount_percent numeric,
  add column if not exists include_ship_classes text[],
  add column if not exists exclude_ship_classes text[];

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

alter table public.product_image_features
  add column if not exists clip_embedding real[],
  add column if not exists ocr_text text,
  add column if not exists ocr_tokens text[],
  add column if not exists color_hist real[],
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_product_image_features_product
  on public.product_image_features (product_id);

alter table public.product_image_features enable row level security;

drop policy if exists "staff read product image features" on public.product_image_features;
create policy "staff read product image features" on public.product_image_features
for select using (public.is_staff());

drop policy if exists "staff manage product image features" on public.product_image_features;
create policy "staff manage product image features" on public.product_image_features
for all using (public.is_staff()) with check (public.is_staff());

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
declare
  v_user_id uuid;
begin
  v_user_id := new.user_id;

  if v_user_id is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.payment_status = 'PAID')
     or (tg_op = 'UPDATE' and new.payment_status = 'PAID' and old.payment_status is distinct from new.payment_status) then
    perform public.fn_recalculate_profile_tier(v_user_id);
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
    v_now timestamptz := now();
    v_tier text;
    v_base_total numeric := 0;
    v_shipping_discount numeric := 0;
    v_order_discount numeric := 0;
    v_kind text;
    v_percent numeric := 0;
    v_ship_method text;
    v_order_user_id uuid;
    v_voucher_id uuid;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  v_order_user_id := new.user_id;
  v_voucher_id := new.voucher_id;

  select p.tier into v_tier from public.profiles p where p.id = v_order_user_id;
  if coalesce(v_tier, 'SILVER') = 'PLATINUM' then
    new.priority_level := 'PRIORITY';
  else
    new.priority_level := 'NORMAL';
  end if;

  new.shipping_discount := 0;
  new.discount_total := 0;

  v_base_total := coalesce(new.subtotal, 0)
    + coalesce(new.shipping_fee, 0)
    + coalesce(new.cop_fee, 0)
    + coalesce(new.lalamove_fee, 0)
    + coalesce(new.priority_fee, 0)
    + coalesce(new.insurance_fee, 0);

  if v_voucher_id is null then
    new.total := v_base_total;
    return new;
  end if;

  select * into v_voucher
  from public.vouchers
  where id = v_voucher_id
    and is_active = true;

  if not found then
    raise exception 'Voucher unavailable.';
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

    if v_voucher.include_couriers is not null
       and array_length(v_voucher.include_couriers, 1) is not null then
      v_ship_method := upper(trim(coalesce(new.shipping_method, '')));
      if v_ship_method = '' then
        raise exception 'Voucher requires a shipping method.';
      end if;
      if v_ship_method in ('J&T', 'J&T EXPRESS', 'J&TEXPRESS', 'JT') then
        v_ship_method := 'JNT';
      end if;
      if not (v_ship_method = any(v_voucher.include_couriers)) then
        raise exception 'Voucher not eligible for this courier.';
      end if;
    end if;

  v_kind := upper(trim(coalesce(v_voucher.kind, '')));

  if v_kind in ('FREE_SHIPPING', 'SHIPPING_DISCOUNT') then
    if coalesce(new.shipping_fee, 0) <= 0 then
      raise exception 'Voucher not eligible for zero shipping fee.';
    end if;
  end if;

  if v_kind = 'FREE_SHIPPING' then
    if coalesce(v_voucher.shipping_cap, 0) > 0 then
      v_shipping_discount := least(
        coalesce(new.shipping_fee, 0),
        coalesce(v_voucher.shipping_cap, 0)
      );
    else
      v_shipping_discount := coalesce(new.shipping_fee, 0);
    end if;
  elsif v_kind = 'SHIPPING_DISCOUNT' then
    v_shipping_discount := least(
      coalesce(new.shipping_fee, 0),
      coalesce(v_voucher.shipping_cap, 0)
    );

    if v_shipping_discount <= 0 then
      raise exception 'Shipping discount amount required.';
    end if;
  elsif v_kind = 'ORDER_DISCOUNT' then
    if coalesce(v_voucher.discount_amount, 0) > 0 then
      v_order_discount := least(coalesce(new.subtotal, 0), v_voucher.discount_amount);
    elsif coalesce(v_voucher.discount_percent, 0) > 0 then
      v_percent := least(greatest(v_voucher.discount_percent, 0), 100);
      v_order_discount := round(coalesce(new.subtotal, 0) * (v_percent / 100.0), 2);
    else
      raise exception 'Voucher discount not configured.';
    end if;
  else
    raise exception 'Voucher type not supported.';
  end if;

  new.shipping_discount := v_shipping_discount;
  new.discount_total := v_order_discount + v_shipping_discount;
  new.total := greatest(v_base_total - v_order_discount - v_shipping_discount, 0);

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
  v_order_id uuid;
  v_order_user_id uuid;
  v_voucher_id uuid;
begin
  v_order_id := new.id;
  v_order_user_id := new.user_id;
  v_voucher_id := new.voucher_id;

  if v_voucher_id is null then
    return new;
  end if;

  update public.voucher_wallet
    set status = 'USED',
        used_at = v_now,
        order_id = v_order_id
  where id = (
    select vw.id
    from public.voucher_wallet vw
    where vw.user_id = v_order_user_id
      and vw.voucher_id = v_voucher_id
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
declare
  v_order_id uuid;
begin
  v_order_id := new.id;

  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, event_type, message)
    values (v_order_id, 'CREATED', 'Order placed');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status = 'AWAITING_PAYMENT' then
      insert into public.order_events (order_id, event_type, message)
      values (v_order_id, 'APPROVED', 'Order approved');
    end if;

    if new.shipping_status is distinct from old.shipping_status then
      if new.shipping_status in ('PREPARING', 'PREPARING TO SHIP', 'TO_SHIP', 'PENDING_SHIPMENT') then
        insert into public.order_events (order_id, event_type, message)
        values (v_order_id, 'PACKED', 'Order packed');
      elsif new.shipping_status = 'SHIPPED' then
        insert into public.order_events (order_id, event_type, message)
        values (v_order_id, 'SHIPPED', 'Order shipped');
      elsif new.shipping_status in ('COMPLETED', 'DELIVERED') then
        insert into public.order_events (order_id, event_type, message)
        values (v_order_id, 'DELIVERED', 'Order delivered');
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
  v_item_variant_id uuid;
  v_item_qty integer;
  v_deadline timestamptz;
  v_sold_out uuid[] := '{}';
  v_remaining int;
  v_tier text;
  v_order_user_id uuid;
  v_order_approval_enabled boolean := true;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  v_order_user_id := v_order.user_id;

  if v_order_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select s.order_approval_enabled
    into v_order_approval_enabled
  from public.settings s
  where s.id = 1;

  if coalesce(v_order_approval_enabled, true) then
    select p.tier into v_tier from public.profiles p where p.id = v_order_user_id;
    if coalesce(v_tier, 'SILVER') not in ('GOLD', 'PLATINUM') then
      return jsonb_build_object('ok', true, 'eligible', false, 'order_id', p_order_id);
    end if;
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
    v_item_variant_id := v_item.variant_id;
    v_item_qty := v_item.qty;

    update public.product_variants
      set qty = qty - v_item_qty
    where id = v_item_variant_id
      and qty >= v_item_qty
    returning qty into v_remaining;

    if not found then
      raise exception 'Insufficient stock for variant %', v_item_variant_id;
    end if;

    if v_remaining <= 0 then
      v_sold_out := array_append(v_sold_out, v_item_variant_id);
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

drop function if exists public.fn_admin_grant_voucher(
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  timestamptz,
  timestamptz,
  boolean,
  int,
  int,
  uuid[],
  boolean,
  int,
  timestamptz,
  uuid
);

create or replace function public.fn_admin_grant_voucher(
  p_kind text,
  p_title text default null,
  p_code text default null,
  p_discount_amount numeric default null,
  p_discount_percent numeric default null,
  p_include_ship_classes text[] default null,
  p_exclude_ship_classes text[] default null,
  p_shipping_cap numeric default null,
  p_min_subtotal numeric default 0,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_is_active boolean default true,
  p_max_per_user int default null,
  p_max_redemptions int default null,
  p_user_ids uuid[] default null,
  p_grant_all boolean default false,
  p_per_user int default 1,
  p_wallet_expires_at timestamptz default null,
  p_voucher_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text;
  v_voucher public.vouchers%rowtype;
  v_voucher_id uuid;
  v_created boolean := false;
  v_updated boolean := false;
  v_granted int := 0;
  v_per_user int := 1;
  v_existing_total int := 0;
  v_remaining_redemptions int;
  v_effective_shipping_cap numeric;
  v_effective_discount_amount numeric;
  v_effective_discount_percent numeric;
  v_effective_max_per_user int;
  v_effective_max_redemptions int;
  v_wallet_expires_at timestamptz;
  v_include_classes text[];
  v_exclude_classes text[];
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  v_kind := upper(trim(coalesce(p_kind, '')));
  if v_kind not in ('ORDER_DISCOUNT', 'SHIPPING_DISCOUNT', 'FREE_SHIPPING') then
    raise exception 'Invalid voucher kind.';
  end if;

  if p_voucher_id is not null then
    select * into v_voucher from public.vouchers where id = p_voucher_id;
    if not found then
      raise exception 'Voucher not found: %', p_voucher_id;
    end if;
  elsif p_code is not null then
    select * into v_voucher from public.vouchers where code = p_code;
  end if;

  v_effective_discount_amount := coalesce(p_discount_amount, v_voucher.discount_amount);
  v_effective_discount_percent := coalesce(p_discount_percent, v_voucher.discount_percent);
  v_effective_shipping_cap := coalesce(p_shipping_cap, v_voucher.shipping_cap);
  v_effective_max_per_user := coalesce(p_max_per_user, v_voucher.max_per_user);
  v_effective_max_redemptions := coalesce(p_max_redemptions, v_voucher.max_redemptions);

  if p_include_ship_classes is not null then
    select array_agg(distinct upper(trim(c))) into v_include_classes
    from unnest(p_include_ship_classes) as c
    where c is not null and length(trim(c)) > 0;
    if v_include_classes is null then
      v_include_classes := '{}'::text[];
    end if;
  end if;

  if p_exclude_ship_classes is not null then
    select array_agg(distinct upper(trim(c))) into v_exclude_classes
    from unnest(p_exclude_ship_classes) as c
    where c is not null and length(trim(c)) > 0;
    if v_exclude_classes is null then
      v_exclude_classes := '{}'::text[];
    end if;
  end if;

  if v_kind = 'ORDER_DISCOUNT' then
    if coalesce(v_effective_discount_amount, 0) > 0 and coalesce(v_effective_discount_percent, 0) > 0 then
      raise exception 'Provide discount amount or percent, not both.';
    end if;
    if coalesce(v_effective_discount_amount, 0) <= 0 and coalesce(v_effective_discount_percent, 0) <= 0 then
      raise exception 'Discount amount or percent required.';
    end if;
    if coalesce(v_effective_discount_percent, 0) < 0 or coalesce(v_effective_discount_percent, 0) > 100 then
      raise exception 'Discount percent must be between 0 and 100.';
    end if;
  elsif v_kind = 'SHIPPING_DISCOUNT' then
    if coalesce(v_effective_shipping_cap, 0) <= 0 then
      raise exception 'Shipping discount amount required.';
    end if;
  end if;

  if v_voucher.id is null then
    insert into public.vouchers (
      code,
      title,
      kind,
      min_subtotal,
      shipping_cap,
      discount_amount,
      discount_percent,
      include_ship_classes,
      exclude_ship_classes,
      starts_at,
      expires_at,
      is_active,
      max_per_user,
      max_redemptions
    )
    values (
      p_code,
      p_title,
      v_kind,
      coalesce(p_min_subtotal, 0),
      coalesce(p_shipping_cap, 0),
      p_discount_amount,
      p_discount_percent,
      v_include_classes,
      v_exclude_classes,
      p_starts_at,
      p_expires_at,
      coalesce(p_is_active, true),
      p_max_per_user,
      p_max_redemptions
    )
    returning id into v_voucher_id;

    v_created := true;
  else
    v_voucher_id := v_voucher.id;

    update public.vouchers
      set code = coalesce(p_code, code),
          title = coalesce(p_title, title),
          kind = v_kind,
          min_subtotal = coalesce(p_min_subtotal, min_subtotal),
          shipping_cap = coalesce(p_shipping_cap, shipping_cap),
          discount_amount = coalesce(p_discount_amount, discount_amount),
          discount_percent = coalesce(p_discount_percent, discount_percent),
          include_ship_classes = coalesce(v_include_classes, include_ship_classes),
          exclude_ship_classes = coalesce(v_exclude_classes, exclude_ship_classes),
          starts_at = coalesce(p_starts_at, starts_at),
          expires_at = coalesce(p_expires_at, expires_at),
          is_active = coalesce(p_is_active, is_active),
          max_per_user = coalesce(p_max_per_user, max_per_user),
          max_redemptions = coalesce(p_max_redemptions, max_redemptions)
    where id = v_voucher_id;

    v_updated := true;
  end if;

  if not coalesce(p_grant_all, false)
     and (p_user_ids is null or array_length(p_user_ids, 1) is null) then
    return jsonb_build_object(
      'ok', true,
      'voucher_id', v_voucher_id,
      'created', v_created,
      'updated', v_updated,
      'granted', 0
    );
  end if;

  v_per_user := greatest(1, coalesce(p_per_user, 1));
  v_wallet_expires_at := coalesce(
    p_wallet_expires_at,
    (select expires_at from public.vouchers where id = v_voucher_id)
  );

  if v_effective_max_redemptions is not null then
    select count(*) into v_existing_total
    from public.voucher_wallet
    where voucher_id = v_voucher_id
      and coalesce(status, 'AVAILABLE') <> 'EXPIRED';

    v_remaining_redemptions := v_effective_max_redemptions - v_existing_total;
    if v_remaining_redemptions <= 0 then
      return jsonb_build_object(
        'ok', true,
        'voucher_id', v_voucher_id,
        'created', v_created,
        'updated', v_updated,
        'granted', 0,
        'maxed_out', true
      );
    end if;
  end if;

  with target_users as (
    select distinct u.id as user_id
    from auth.users u
    where coalesce(p_grant_all, false)
    union
    select distinct u as user_id
    from unnest(p_user_ids) as u
    where not coalesce(p_grant_all, false)
      and p_user_ids is not null
      and u is not null
  ),
  existing as (
    select user_id, count(*)::int as existing
    from public.voucher_wallet
    where voucher_id = v_voucher_id
      and coalesce(status, 'AVAILABLE') <> 'EXPIRED'
    group by user_id
  ),
  limits as (
    select t.user_id,
           case
             when v_effective_max_per_user is null then v_per_user
             else greatest(0, least(v_per_user, v_effective_max_per_user - coalesce(e.existing, 0)))
           end as grant_count
    from target_users t
    left join existing e on e.user_id = t.user_id
  ),
  rows as (
    select l.user_id
    from limits l
    join lateral generate_series(1, l.grant_count) gs on true
  ),
  capped as (
    select user_id
    from rows
    order by user_id
    limit coalesce(v_remaining_redemptions, 2147483647)
  ),
  ins as (
    insert into public.voucher_wallet (user_id, voucher_id, expires_at)
    select user_id, v_voucher_id, v_wallet_expires_at
    from capped
    on conflict do nothing
    returning 1
  )
  select count(*) into v_granted from ins;

  return jsonb_build_object(
    'ok', true,
    'voucher_id', v_voucher_id,
    'created', v_created,
    'updated', v_updated,
    'granted', v_granted
  );
end;
$$;

revoke execute on function public.fn_admin_grant_voucher(
  text,
  text,
  text,
  numeric,
  numeric,
  text[],
  text[],
  numeric,
  numeric,
  timestamptz,
  timestamptz,
  boolean,
  int,
  int,
  uuid[],
  boolean,
  int,
  timestamptz,
  uuid
) from public;
grant execute on function public.fn_admin_grant_voucher(
  text,
  text,
  text,
  numeric,
  numeric,
  text[],
  text[],
  numeric,
  numeric,
  timestamptz,
  timestamptz,
  boolean,
  int,
  int,
  uuid[],
  boolean,
  int,
  timestamptz,
  uuid
) to authenticated;

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
declare
  v_user_id uuid;
begin
  v_user_id := new.user_id;

  if v_user_id is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.payment_status = 'PAID')
     or (tg_op = 'UPDATE' and new.payment_status = 'PAID' and old.payment_status is distinct from new.payment_status) then
    perform public.fn_grant_spend_vouchers(v_user_id);
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

-- Auto-match improvements: support multiple hashes per image
alter table public.product_image_hashes
  drop constraint if exists product_image_hashes_pkey;

alter table public.product_image_hashes
  add constraint product_image_hashes_pkey primary key (product_id, image_url, hash_algo);

create index if not exists idx_product_image_hashes_algo_hash
  on public.product_image_hashes (hash_algo, image_hash);

alter table public.product_upload_matches
  add column if not exists upload_hashes jsonb;

alter table public.products
  add column if not exists special_tags text[] not null default '{}'::text[];

alter table public.products
  drop constraint if exists products_special_tags_valid;

alter table public.products
  add constraint products_special_tags_valid
  check (
    special_tags <@ array['exclusive','limited_edition','chase','rare','new_release','discontinued']::text[]
  );

-- Product tags are manual-only. Do not auto-backfill special_tags from text.

update public.products
set special_tags = array_remove(special_tags, 'new_release')
where 'new_release' = any(special_tags);

-- Harden auth signup profile creation against schema drift in public.profiles.
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

-- Prevent recursive profile-policy checks from breaking public shop reads.
drop policy if exists "staff read profiles" on public.profiles;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'cashier')
  );
$$;

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
    case when v_user_id is not null then 1 else 0 end,
    case when v_user_id is null then 1 else 0 end,
    now()
  )
  on conflict (product_id)
  do update set
    adds = public.product_add_to_cart.adds + 1,
    auth_adds = public.product_add_to_cart.auth_adds
      + case when v_user_id is not null then 1 else 0 end,
    guest_adds = public.product_add_to_cart.guest_adds
      + case when v_user_id is null then 1 else 0 end,
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

revoke execute on function public.increment_product_add_to_cart_detailed(uuid, uuid, integer, uuid) from public;
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

-- Inventory refresher quantity-aware seen tracking
alter table public.inventory_refresher_seen_items
  add column if not exists seen_qty int not null default 0;

alter table public.inventory_refresher_seen_items
  drop constraint if exists inventory_refresher_seen_items_seen_qty_check;

alter table public.inventory_refresher_seen_items
  add constraint inventory_refresher_seen_items_seen_qty_check
  check (seen_qty >= 0);

update public.inventory_refresher_seen_items
set seen_qty = case
  when coalesce(qty, 0) > 0 then 1
  else 0
end
where coalesce(seen_qty, 0) <= 0;

-- Cashflow automation: inventory expenses per add/upload event + daily sales income

create table if not exists public.cashflow_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  flow_type text not null check (flow_type in ('INCOME', 'EXPENSE')),
  category text not null check (
    category in (
      'LOAN',
      'MONTHLY_PAYMENT',
      'ALLOWANCE_INCOME',
      'ALLOWANCE_COST',
      'BILL',
      'EVENT_MATERIALS',
      'SHIPPING_MATERIALS',
      'INVENTORY_COST',
      'OTHER'
    )
  ),
  title text not null,
  counterparty text,
  amount numeric not null default 0 check (amount >= 0),
  notes text,
  is_recurring boolean not null default false,
  source_type text,
  source_key text,
  source_meta jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cashflow_entries
  add column if not exists source_type text,
  add column if not exists source_key text,
  add column if not exists source_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_cashflow_entries_entry_date
  on public.cashflow_entries (entry_date desc, created_at desc);

create index if not exists idx_cashflow_entries_category
  on public.cashflow_entries (category, flow_type);

create unique index if not exists idx_cashflow_entries_source_unique
  on public.cashflow_entries (source_type, source_key);

create or replace function public.fn_touch_cashflow_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cashflow_entries_updated_at on public.cashflow_entries;
create trigger trg_cashflow_entries_updated_at
before update on public.cashflow_entries
for each row execute procedure public.fn_touch_cashflow_entries_updated_at();

alter table public.cashflow_entries enable row level security;

drop policy if exists "staff read cashflow entries" on public.cashflow_entries;
create policy "staff read cashflow entries" on public.cashflow_entries
for select using (public.is_staff());

drop policy if exists "staff manage cashflow entries" on public.cashflow_entries;
create policy "staff manage cashflow entries" on public.cashflow_entries
for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.cash_loans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lender text,
  principal_amount numeric not null default 0 check (principal_amount >= 0),
  term_months int not null check (term_months > 0),
  monthly_payment numeric not null default 0 check (monthly_payment > 0),
  start_date date not null,
  first_due_date date not null,
  next_due_date date,
  payment_day int check (payment_day between 1 and 31),
  reminder_days_before int not null default 3 check (reminder_days_before >= 0),
  months_paid int not null default 0 check (months_paid >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAID', 'CANCELLED')),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cash_loans_status_due
  on public.cash_loans (status, next_due_date asc);

create or replace function public.fn_touch_cash_loans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cash_loans_updated_at on public.cash_loans;
create trigger trg_cash_loans_updated_at
before update on public.cash_loans
for each row execute procedure public.fn_touch_cash_loans_updated_at();

alter table public.cash_loans enable row level security;

drop policy if exists "staff read cash loans" on public.cash_loans;
create policy "staff read cash loans" on public.cash_loans
for select using (public.is_staff());

drop policy if exists "staff manage cash loans" on public.cash_loans;
create policy "staff manage cash loans" on public.cash_loans
for all using (public.is_staff()) with check (public.is_staff());

create table if not exists public.inventory_cost_events (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_movement_id uuid references public.variant_stock_movements(id) on delete cascade,
  qty_added int not null check (qty_added > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  movement_type text not null check (movement_type in ('initial_stock','restock','increase')),
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  entry_date date not null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

alter table public.inventory_cost_events
  add column if not exists stock_movement_id uuid references public.variant_stock_movements(id) on delete cascade;

create index if not exists idx_inventory_cost_events_entry_date
  on public.inventory_cost_events (entry_date desc, occurred_at desc);

create index if not exists idx_inventory_cost_events_variant
  on public.inventory_cost_events (variant_id, occurred_at desc);

create unique index if not exists idx_inventory_cost_events_stock_movement_unique
  on public.inventory_cost_events (stock_movement_id)
  where stock_movement_id is not null;

alter table public.inventory_cost_events enable row level security;

drop policy if exists "staff read inventory cost events" on public.inventory_cost_events;
create policy "staff read inventory cost events" on public.inventory_cost_events
for select using (public.is_staff());

drop policy if exists "staff manage inventory cost events" on public.inventory_cost_events;
create policy "staff manage inventory cost events" on public.inventory_cost_events
for all using (public.is_staff()) with check (public.is_staff());

create or replace function public.fn_sync_inventory_daily_cashflow(
  p_entry_date date
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_entry_date date := p_entry_date;
  v_amount numeric := 0;
  v_event_count int := 0;
  v_units int := 0;
  v_on_hand_units int := 0;
  v_consumed_units int := 0;
begin
  if v_entry_date is null then
    return;
  end if;

  select
    coalesce(r.amount, 0),
    coalesce(r.event_count, 0)::int,
    coalesce(r.units_added, 0)::int,
    coalesce(r.on_hand_units, 0)::int,
    coalesce(r.consumed_units, 0)::int
  into
    v_amount,
    v_event_count,
    v_units,
    v_on_hand_units,
    v_consumed_units
  from (
    select
      amount,
      event_count,
      units_added,
      on_hand_units,
      consumed_units
    from public.inventory_cashflow_daily_rollup
    where entry_date = v_entry_date
    union all
    select 0::numeric, 0::int, 0::int, 0::int, 0::int
    limit 1
  ) r;

  if v_event_count <= 0 then
    delete from public.cashflow_entries
    where source_type = 'INVENTORY_DAILY_SUBTOTAL'
      and source_key = v_entry_date::text;
    return;
  end if;

  insert into public.cashflow_entries (
    entry_date,
    flow_type,
    category,
    title,
    counterparty,
    amount,
    notes,
    is_recurring,
    source_type,
    source_key,
    source_meta,
    created_by_user_id
  )
  values (
    v_entry_date,
    'EXPENSE',
    'INVENTORY_COST',
    'Inventory subtotal',
    null,
    v_amount,
    'Auto-generated from inventory additions for this day.',
    false,
    'INVENTORY_DAILY_SUBTOTAL',
    v_entry_date::text,
    jsonb_build_object(
      'event_count', v_event_count,
      'units_added', v_units,
      'on_hand_units', v_on_hand_units,
      'consumed_units', v_consumed_units,
      'timezone', 'Asia/Manila'
    ),
    null
  )
  on conflict (source_type, source_key)
  do update set
    entry_date = excluded.entry_date,
    flow_type = excluded.flow_type,
    category = excluded.category,
    title = excluded.title,
    counterparty = excluded.counterparty,
    amount = excluded.amount,
    notes = excluded.notes,
    is_recurring = excluded.is_recurring,
    source_meta = excluded.source_meta,
    updated_at = now();
end;
$$;

create or replace function public.fn_sync_inventory_cost_event_from_stock_movement(
  p_stock_movement_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_movement public.variant_stock_movements%rowtype;
  v_unit_cost numeric := 0;
  v_event_id uuid;
  v_existing_event_id uuid;
  v_event_meta jsonb;
  v_event_entry_date date;
begin
  if p_stock_movement_id is null then
    return null;
  end if;

  select *
  into v_movement
  from public.variant_stock_movements
  where id = p_stock_movement_id;

  if not found or v_movement.qty_delta <= 0 or v_movement.movement_type not in ('initial_stock', 'restock', 'increase') then
    select id
    into v_existing_event_id
    from public.inventory_cost_events
    where stock_movement_id = p_stock_movement_id;

    if found then
      delete from public.cashflow_entries
      where source_type = 'INVENTORY_COST_EVENT'
        and source_key = v_existing_event_id::text;

      delete from public.inventory_cost_events
      where id = v_existing_event_id;
    end if;

    return null;
  end if;

  select greatest(
      coalesce(nullif(v_movement.meta->>'unit_cost_snapshot', '')::numeric, pv.cost, 0),
      0
    )
  into v_unit_cost
  from public.product_variants pv
  where pv.id = v_movement.variant_id;

  v_event_entry_date := timezone('Asia/Manila', v_movement.recorded_at)::date;
  v_event_meta := coalesce(v_movement.meta, '{}'::jsonb) || jsonb_build_object(
    'stock_movement_id', v_movement.id,
    'cost_basis', case
      when nullif(v_movement.meta->>'unit_cost_snapshot', '') is not null then 'movement_snapshot'
      else 'current_variant_cost'
    end,
    'timezone', 'Asia/Manila'
  );

  select id
  into v_existing_event_id
  from public.inventory_cost_events
  where stock_movement_id = v_movement.id
  limit 1;

  if v_existing_event_id is not null then
    update public.inventory_cost_events
    set
      variant_id = v_movement.variant_id,
      product_id = v_movement.product_id,
      stock_movement_id = v_movement.id,
      qty_added = v_movement.qty_delta,
      unit_cost = v_unit_cost,
      subtotal = v_movement.qty_delta * v_unit_cost,
      movement_type = v_movement.movement_type,
      actor_user_id = v_movement.actor_user_id,
      occurred_at = v_movement.recorded_at,
      entry_date = v_event_entry_date,
      meta = v_event_meta
    where id = v_existing_event_id
    returning id into v_event_id;
  else
    insert into public.inventory_cost_events (
      variant_id,
      product_id,
      stock_movement_id,
      qty_added,
      unit_cost,
      subtotal,
      movement_type,
      actor_user_id,
      occurred_at,
      entry_date,
      meta
    )
    values (
      v_movement.variant_id,
      v_movement.product_id,
      v_movement.id,
      v_movement.qty_delta,
      v_unit_cost,
      v_movement.qty_delta * v_unit_cost,
      v_movement.movement_type,
      v_movement.actor_user_id,
      v_movement.recorded_at,
      v_event_entry_date,
      v_event_meta
    )
    returning id into v_event_id;
  end if;

  return v_event_id;
end;
$$;

create or replace function public.fn_sync_inventory_cashflow_from_event(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_event record;
begin
  if p_event_id is null then
    return;
  end if;

  select *
  into v_event
  from public.inventory_cost_event_effective
  where id = p_event_id;

  if not found or coalesce(v_event.effective_expense_qty, 0) <= 0 then
    delete from public.cashflow_entries
    where source_type = 'INVENTORY_COST_EVENT'
      and source_key = p_event_id::text;
    return;
  end if;

  insert into public.cashflow_entries (
    entry_date,
    flow_type,
    category,
    title,
    counterparty,
    amount,
    notes,
    is_recurring,
    source_type,
    source_key,
    source_meta,
    created_by_user_id
  )
  values (
    v_event.entry_date,
    'EXPENSE',
    'INVENTORY_COST',
    'Inventory add',
    null,
    v_event.effective_expense_subtotal,
    'Auto-generated from an inventory upload/add event.',
    false,
    'INVENTORY_COST_EVENT',
    v_event.id::text,
    jsonb_build_object(
      'inventory_cost_event_id', v_event.id,
      'variant_id', v_event.variant_id,
      'product_id', v_event.product_id,
      'qty_added', v_event.qty_added,
      'effective_expense_qty', v_event.effective_expense_qty,
      'effective_removed_qty', v_event.effective_removed_qty,
      'unit_cost', v_event.unit_cost,
      'movement_type', v_event.movement_type,
      'timezone', 'Asia/Manila'
    ) || coalesce(v_event.meta, '{}'::jsonb),
    v_event.actor_user_id
  )
  on conflict (source_type, source_key)
  do update set
    entry_date = excluded.entry_date,
    flow_type = excluded.flow_type,
    category = excluded.category,
    title = excluded.title,
    counterparty = excluded.counterparty,
    amount = excluded.amount,
    notes = excluded.notes,
    is_recurring = excluded.is_recurring,
    source_meta = excluded.source_meta,
    created_by_user_id = excluded.created_by_user_id,
    updated_at = now();
end;
$$;

create or replace function public.fn_sync_inventory_cashflow_after_event_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.cashflow_entries
    where source_type = 'INVENTORY_COST_EVENT'
      and source_key = old.id::text;

    perform public.fn_sync_inventory_daily_cashflow(old.entry_date);
    return old;
  end if;

  perform public.fn_sync_inventory_cashflow_from_event(new.id);

  if tg_op = 'UPDATE' and old.entry_date is distinct from new.entry_date then
    perform public.fn_sync_inventory_daily_cashflow(old.entry_date);
  end if;

  perform public.fn_sync_inventory_daily_cashflow(new.entry_date);
  return new;
end;
$$;

drop trigger if exists trg_inventory_cost_events_cashflow_sync on public.inventory_cost_events;
create trigger trg_inventory_cost_events_cashflow_sync
after insert or update or delete on public.inventory_cost_events
for each row execute procedure public.fn_sync_inventory_cashflow_after_event_change();

create or replace function public.fn_sync_sales_daily_cashflow(
  p_entry_date date
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_entry_date date := p_entry_date;
  v_amount numeric := 0;
  v_order_count int := 0;
begin
  if v_entry_date is null then
    return;
  end if;

  select
    coalesce(sum(o.total), 0),
    count(*)::int
  into
    v_amount,
    v_order_count
  from public.orders o
  where (
      coalesce(o.payment_status, '') = 'PAID'
      or upper(coalesce(o.channel, '')) = 'POS'
    )
    and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
    and timezone('Asia/Manila', coalesce(o.paid_at, o.created_at))::date = v_entry_date;

  if v_order_count <= 0 then
    delete from public.cashflow_entries
    where source_type = 'SALES_DAILY_SUBTOTAL'
      and source_key = v_entry_date::text;
    return;
  end if;

  insert into public.cashflow_entries (
    entry_date,
    flow_type,
    category,
    title,
    counterparty,
    amount,
    notes,
    is_recurring,
    source_type,
    source_key,
    source_meta,
    created_by_user_id
  )
  values (
    v_entry_date,
    'INCOME',
    'OTHER',
    'Sales subtotal',
    null,
    v_amount,
    'Auto-generated from paid web orders and POS sales for this day.',
    false,
    'SALES_DAILY_SUBTOTAL',
    v_entry_date::text,
    jsonb_build_object(
      'order_count', v_order_count,
      'timezone', 'Asia/Manila'
    ),
    null
  )
  on conflict (source_type, source_key)
  do update set
    entry_date = excluded.entry_date,
    flow_type = excluded.flow_type,
    category = excluded.category,
    title = excluded.title,
    counterparty = excluded.counterparty,
    amount = excluded.amount,
    notes = excluded.notes,
    is_recurring = excluded.is_recurring,
    source_meta = excluded.source_meta,
    updated_at = now();
end;
$$;

create or replace function public.fn_backfill_inventory_cost_events_from_stock_movements(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_stock_movement_id uuid;
  v_event_id uuid;
  v_synced_count int := 0;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  for v_stock_movement_id in
    select m.id
    from public.variant_stock_movements m
    where m.qty_delta > 0
      and m.movement_type in ('initial_stock', 'restock', 'increase')
      and (p_from is null or m.recorded_at >= p_from)
      and (p_to is null or m.recorded_at <= p_to)
  loop
    v_event_id := public.fn_sync_inventory_cost_event_from_stock_movement(v_stock_movement_id);
    if v_event_id is not null then
      v_synced_count := v_synced_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'synced_events', v_synced_count,
    'source', 'variant_stock_movements'
  );
end;
$$;

create or replace function public.fn_sync_inventory_cost_event_from_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_event_id uuid;
  v_entry_date date;
begin
  perform public.fn_sync_inventory_cost_event_from_stock_movement(new.id);

  for v_event_id in
    select id
    from public.inventory_cost_events
    where variant_id = new.variant_id
  loop
    perform public.fn_sync_inventory_cashflow_from_event(v_event_id);
  end loop;

  for v_entry_date in
    select distinct entry_date
    from public.inventory_cost_events
    where variant_id = new.variant_id
  loop
    perform public.fn_sync_inventory_daily_cashflow(v_entry_date);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_product_variants_inventory_cost_event on public.product_variants;
drop trigger if exists trg_variant_stock_movements_inventory_cost_event on public.variant_stock_movements;
create trigger trg_variant_stock_movements_inventory_cost_event
after insert on public.variant_stock_movements
for each row execute procedure public.fn_sync_inventory_cost_event_from_movement_trigger();

create or replace function public.fn_sync_sales_cashflow_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old_entry_date date;
  v_new_entry_date date;
begin
  if tg_op <> 'INSERT' then
    v_old_entry_date := timezone('Asia/Manila', coalesce(old.paid_at, old.created_at))::date;
  end if;

  v_new_entry_date := timezone('Asia/Manila', coalesce(new.paid_at, new.created_at))::date;

  if v_old_entry_date is not null then
    perform public.fn_sync_sales_daily_cashflow(v_old_entry_date);
  end if;

  if v_new_entry_date is not null and v_new_entry_date is distinct from v_old_entry_date then
    perform public.fn_sync_sales_daily_cashflow(v_new_entry_date);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_sales_daily_cashflow on public.orders;
create trigger trg_orders_sales_daily_cashflow
after insert or update of total, status, payment_status, paid_at, created_at, channel on public.orders
for each row execute procedure public.fn_sync_sales_cashflow_from_order();

create or replace function public.fn_repair_inventory_cashflow_backlog()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_linked_count int := 0;
  v_deleted_duplicates int := 0;
  v_event_id uuid;
  v_entry_date date;
begin
  with matched as (
    select
      e.id as event_id,
      m.id as stock_movement_id,
      row_number() over (
        partition by e.id
        order by m.recorded_at asc, m.id asc
      ) as event_rank,
      row_number() over (
        partition by m.id
        order by e.created_at asc, e.id asc
      ) as movement_rank
    from public.inventory_cost_events e
    join public.variant_stock_movements m
      on m.variant_id = e.variant_id
     and m.product_id = e.product_id
     and m.qty_delta = e.qty_added
     and m.movement_type = e.movement_type
     and m.recorded_at = e.occurred_at
     and m.qty_delta > 0
    where e.stock_movement_id is null
      and e.movement_type in ('initial_stock', 'restock', 'increase')
  ),
  linked as (
    update public.inventory_cost_events e
    set
      stock_movement_id = matched.stock_movement_id,
      meta = coalesce(e.meta, '{}'::jsonb) || jsonb_build_object(
        'stock_movement_id', matched.stock_movement_id
      )
    from matched
    where matched.event_rank = 1
      and matched.movement_rank = 1
      and e.id = matched.event_id
      and not exists (
        select 1
        from public.inventory_cost_events existing_event
        where existing_event.stock_movement_id = matched.stock_movement_id
          and existing_event.id <> e.id
      )
    returning e.id
  )
  select count(*)::int
  into v_linked_count
  from linked;

  with ranked as (
    select
      id,
      stock_movement_id,
      row_number() over (
        partition by stock_movement_id
        order by created_at asc, id asc
      ) as rn
    from public.inventory_cost_events
    where stock_movement_id is not null
  ),
  dupes as (
    select id
    from ranked
    where rn > 1
  ),
  deleted_cashflow as (
    delete from public.cashflow_entries
    where source_type = 'INVENTORY_COST_EVENT'
      and source_key in (select id::text from dupes)
    returning id
  ),
  deleted_events as (
    delete from public.inventory_cost_events
    where id in (select id from dupes)
    returning id
  )
  select count(*)::int
  into v_deleted_duplicates
  from deleted_events;

  delete from public.cashflow_entries
  where source_type = 'INVENTORY_COST_EVENT';

  delete from public.cashflow_entries
  where source_type = 'INVENTORY_DAILY_SUBTOTAL';

  for v_event_id in
    select id
    from public.inventory_cost_events
  loop
    perform public.fn_sync_inventory_cashflow_from_event(v_event_id);
  end loop;

  for v_entry_date in
    select distinct entry_date
    from public.inventory_cost_events
  loop
    perform public.fn_sync_inventory_daily_cashflow(v_entry_date);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'linked_events', v_linked_count,
    'deleted_duplicates', v_deleted_duplicates
  );
end;
$$;

create or replace view public.inventory_cost_event_effective as
with canonical_events as (
  select *
  from (
    select
      e.*,
      row_number() over (
        partition by coalesce(
          e.stock_movement_id::text,
          e.id::text
        )
        order by e.created_at asc, e.id asc
      ) as canonical_rank
    from public.inventory_cost_events e
  ) ranked
  where canonical_rank = 1
),
variant_totals as (
  select
    pv.id as variant_id,
    greatest(coalesce(sum(case when m.qty_delta > 0 then m.qty_delta else 0 end), 0), 0)::int as total_added_qty,
    greatest(coalesce(sum(case when m.movement_type = 'deduction' then -m.qty_delta else 0 end), 0), 0)::int as manual_removed_qty,
    greatest(coalesce(sum(case when m.movement_type = 'sellout' then -m.qty_delta else 0 end), 0), 0)::int as sold_or_sellout_qty,
    greatest(coalesce(pv.qty, 0), 0)::int as current_qty
  from public.product_variants pv
  left join public.variant_stock_movements m on m.variant_id = pv.id
  group by pv.id, pv.qty
),
event_windows as (
  select
    e.*,
    coalesce(vt.total_added_qty, e.qty_added)::int as variant_total_added_qty,
    coalesce(vt.current_qty, 0)::int as current_qty,
    coalesce(vt.manual_removed_qty, 0)::int as manual_removed_qty,
    coalesce(vt.sold_or_sellout_qty, 0)::int as sold_or_sellout_qty,
    coalesce(
      sum(e.qty_added) over (
        partition by e.variant_id
        order by e.occurred_at asc, e.id asc
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::int as prior_added_qty
  from canonical_events e
  left join variant_totals vt on vt.variant_id = e.variant_id
)
select
  e.id,
  e.variant_id,
  e.product_id,
  e.stock_movement_id,
  e.qty_added,
  e.unit_cost,
  e.subtotal,
  e.movement_type,
  e.actor_user_id,
  e.occurred_at,
  e.entry_date,
  e.created_at,
  e.meta,
  e.current_qty,
  greatest(
    least(
      e.qty_added,
      greatest(e.variant_total_added_qty - e.current_qty, 0) - e.prior_added_qty
    ),
    0
  )::int as effective_consumed_qty,
  (
    e.qty_added - greatest(
      least(
        e.qty_added,
        greatest(e.variant_total_added_qty - e.current_qty, 0) - e.prior_added_qty
      ),
      0
    )
  )::int as effective_remaining_qty,
  e.manual_removed_qty,
  e.sold_or_sellout_qty,
  case
    when e.stock_movement_id is not null then 'LINKED'
    else 'LEGACY'
  end as source_status,
  case
    when greatest(
      least(
        e.qty_added,
        greatest(e.variant_total_added_qty - e.manual_removed_qty, 0) - e.prior_added_qty
      ),
      0
    ) <= 0 then 'REMOVED'
    when (
      e.qty_added - greatest(
        least(
          e.qty_added,
          greatest(e.variant_total_added_qty - e.current_qty, 0) - e.prior_added_qty
        ),
        0
      )
    ) <= 0 then 'SOLD'
    when (
      e.qty_added - greatest(
        least(
          e.qty_added,
          greatest(e.variant_total_added_qty - e.current_qty, 0) - e.prior_added_qty
        ),
        0
      )
    ) > 0 then 'PARTIAL'
    else 'ON_HAND'
  end as lifecycle_status,
  greatest(
    least(
      e.qty_added,
      greatest(e.variant_total_added_qty - e.manual_removed_qty, 0) - e.prior_added_qty
    ),
    0
  )::int as effective_expense_qty,
  (
    e.qty_added - greatest(
      least(
        e.qty_added,
        greatest(e.variant_total_added_qty - e.manual_removed_qty, 0) - e.prior_added_qty
      ),
      0
    )
  )::int as effective_removed_qty,
  (
    greatest(
      least(
        e.qty_added,
        greatest(e.variant_total_added_qty - e.manual_removed_qty, 0) - e.prior_added_qty
      ),
      0
    ) * e.unit_cost
  )::numeric as effective_expense_subtotal
from event_windows e;

create or replace view public.inventory_cashflow_daily_rollup as
select
  entry_date,
  coalesce(sum(effective_expense_subtotal), 0)::numeric as amount,
  count(*) filter (where effective_expense_qty > 0)::int as event_count,
  coalesce(sum(effective_expense_qty), 0)::int as units_added,
  coalesce(sum(effective_remaining_qty), 0)::int as on_hand_units,
  coalesce(sum(effective_consumed_qty), 0)::int as consumed_units
from public.inventory_cost_event_effective
where effective_expense_qty > 0
group by entry_date;

do $$
declare
  v_event_id uuid;
  v_entry_date date;
begin
  delete from public.cashflow_entries
  where source_type = 'INVENTORY_DAILY_SUBTOTAL';

  delete from public.cashflow_entries
  where source_type = 'INVENTORY_COST_EVENT';

  perform public.fn_backfill_inventory_cost_events_from_stock_movements(null, null);
  perform public.fn_repair_inventory_cashflow_backlog();

  for v_event_id in
    select id
    from public.inventory_cost_events
  loop
    perform public.fn_sync_inventory_cashflow_from_event(v_event_id);
  end loop;

  for v_entry_date in
    select distinct timezone('Asia/Manila', coalesce(o.paid_at, o.created_at))::date as entry_date
    from public.orders o
    where (
        coalesce(o.payment_status, '') = 'PAID'
        or upper(coalesce(o.channel, '')) = 'POS'
      )
      and upper(coalesce(o.status, '')) not in ('VOIDED', 'CANCELLED')
  loop
    perform public.fn_sync_sales_daily_cashflow(v_entry_date);
  end loop;
end;
$$;

revoke execute on function public.fn_backfill_inventory_cost_events_from_stock_movements(timestamptz, timestamptz) from public;
grant execute on function public.fn_backfill_inventory_cost_events_from_stock_movements(timestamptz, timestamptz) to authenticated;
