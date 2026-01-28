/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!value) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}. Set it in .env.local or environment.`);
  return v;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const apply = hasArg("--apply");
  const dryRun = !apply;

  console.log(dryRun ? "Dry run: no changes will be made." : "Applying changes...");

  let filterMode = "channel";
  let { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id,channel,user_id")
    .eq("channel", "POS");

  const channelMissing =
    ordersErr && String(ordersErr.message ?? "").toLowerCase().includes("channel");

  if (channelMissing) {
    filterMode = "staff";
    const { data: staff, error: staffErr } = await supabase
      .from("profiles")
      .select("id,role")
      .in("role", ["admin", "cashier"]);
    if (staffErr) throw staffErr;
    const staffIds = (staff ?? []).map((s) => s.id).filter(Boolean);
    if (!staffIds.length) {
      console.log("No staff profiles found. Nothing to backfill.");
      return;
    }
    const retry = await supabase
      .from("orders")
      .select("id,user_id")
      .in("user_id", staffIds);
    orders = retry.data;
    ordersErr = retry.error;
  }

  if (ordersErr) throw ordersErr;

  const orderIds = (orders ?? []).map((o) => o.id).filter(Boolean);
  if (!orderIds.length) {
    console.log("No POS orders found.");
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("id,order_id,variant_id,item_id,qty,line_total,unit_price,price_each,cost_each")
    .in("order_id", orderIds);

  if (itemsErr) throw itemsErr;

  const rows = (items ?? []).filter(Boolean);
  if (!rows.length) {
    console.log("No order items found for POS orders.");
    return;
  }

  const variantIds = Array.from(
    new Set(
      rows
        .map((it) => it.variant_id ?? it.item_id)
        .filter(Boolean)
        .map((v) => String(v))
    )
  );

  const variantMap = new Map();
  if (variantIds.length) {
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id,cost,price")
      .in("id", variantIds);
    if (vErr) throw vErr;
    (variants ?? []).forEach((v) => {
      if (v?.id) variantMap.set(String(v.id), v);
    });
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const it of rows) {
    const id = String(it.id);
    const qtyRaw = Number(it.qty ?? 0);
    const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;

    const variantId = it.variant_id ?? it.item_id;
    const variant = variantId ? variantMap.get(String(variantId)) : null;

    const unitRaw = Number(it.price_each ?? it.unit_price ?? variant?.price ?? 0);
    const unit = Number.isFinite(unitRaw) ? unitRaw : 0;
    const lineTotalRaw = Number(it.line_total ?? 0);
    const lineTotal =
      Number.isFinite(lineTotalRaw) && lineTotalRaw > 0
        ? lineTotalRaw
        : unit * qty;

    const costEachRaw = Number(it.cost_each ?? variant?.cost ?? NaN);
    const costEach = Number.isFinite(costEachRaw) ? costEachRaw : null;

    const updates = {};

    if (!it.variant_id && it.item_id) {
      updates.variant_id = it.item_id;
    }

    if ((it.line_total === null || Number(it.line_total) <= 0) && lineTotal > 0) {
      updates.line_total = lineTotal;
    }

    if ((it.cost_each === null || it.cost_each === undefined) && costEach !== null) {
      updates.cost_each = costEach;
    }

    const keys = Object.keys(updates);
    if (!keys.length) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${id} ->`, updates);
      updated += 1;
      continue;
    }

    const { error: uErr } = await supabase.from("order_items").update(updates).eq("id", id);
    if (uErr) {
      failed += 1;
      console.error(`Failed to update ${id}:`, uErr.message ?? uErr);
      continue;
    }
    updated += 1;
  }

  console.log(
    `Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed} (filter=${filterMode})`
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
