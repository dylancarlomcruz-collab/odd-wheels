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
  if (!v) {
    throw new Error(`Missing ${key}. Set it in .env.local or environment.`);
  }
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

  let selectCols =
    "id,created_at,user_id,status,payment_status,shipping_status,shipping_method,channel,inventory_deducted";
  let filterMode = "channel";
  let { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(selectCols)
    .eq("channel", "POS")
    .neq("payment_status", "PAID")
    .not("status", "in", "(CANCELLED,VOIDED)");

  const channelMissing =
    ordersErr && String(ordersErr.message ?? "").toLowerCase().includes("channel");

  if (channelMissing) {
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

    filterMode = "staff";
    selectCols =
      "id,created_at,user_id,status,payment_status,shipping_status,shipping_method,inventory_deducted";
    const retry = await supabase
      .from("orders")
      .select(selectCols)
      .in("user_id", staffIds)
      .neq("payment_status", "PAID")
      .not("status", "in", "(CANCELLED,VOIDED)");

    orders = retry.data;
    ordersErr = retry.error;
  }

  if (ordersErr && String(ordersErr.message ?? "").includes("inventory_deducted")) {
    selectCols = selectCols.replace(",inventory_deducted", "");
    let retry;
    if (filterMode === "channel") {
      retry = await supabase
        .from("orders")
        .select(selectCols)
        .eq("channel", "POS")
        .neq("payment_status", "PAID")
        .not("status", "in", "(CANCELLED,VOIDED)");
    } else {
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
      retry = await supabase
        .from("orders")
        .select(selectCols)
        .in("user_id", staffIds)
        .neq("payment_status", "PAID")
        .not("status", "in", "(CANCELLED,VOIDED)");
    }
    orders = retry.data;
    ordersErr = retry.error;
  }

  if (ordersErr) throw ordersErr;

  const list = (orders ?? []).filter(Boolean);
  if (!list.length) {
    console.log("No staff-created unpaid orders found.");
    return;
  }

  console.log(
    `Found ${list.length} ${filterMode === "channel" ? "POS" : "staff-created"} unpaid orders.`
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const o of list) {
    const id = String(o.id);
    const inventoryDeducted = Boolean(o.inventory_deducted ?? true);
    const skipRpc = filterMode === "channel";
    const hasUserId = Boolean(o.user_id);

    if (dryRun) {
      console.log(`[dry-run] would mark ${id} as PAID + COMPLETED`);
      updated += 1;
      continue;
    }

    try {
      if (!inventoryDeducted && !skipRpc) {
        const { error: rpcErr } = await supabase.rpc("fn_process_paid_order", {
          p_order_id: id,
        });
        if (rpcErr) throw rpcErr;
      } else if (hasUserId) {
        const { error: payErr } = await supabase
          .from("orders")
          .update({
            payment_status: "PAID",
            status: "PAID",
            paid_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (payErr) throw payErr;
      }

      const { error: completeErr } = await supabase
        .from("orders")
        .update({
          shipping_status: "COMPLETED",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (completeErr) throw completeErr;

      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to update ${id}:`, err?.message ?? err);
      continue;
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
