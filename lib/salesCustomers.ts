"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SalesCustomerSuggestion = {
  id: string;
  name: string;
  phone: string | null;
  order_count: number;
  total_spend: number;
  last_order_at: string | null;
};

export async function fetchSalesCustomerSuggestions(
  client: SupabaseClient,
  query: string,
  limit = 8
): Promise<SalesCustomerSuggestion[]> {
  const { data, error } = await client.rpc("fn_suggest_sales_customers", {
    p_query: query.trim() || null,
    p_limit: limit,
  });

  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim(),
    phone:
      typeof row.phone === "string" && row.phone.trim().length
        ? row.phone.trim()
        : null,
    order_count: Number(row.order_count ?? 0),
    total_spend: Number(row.total_spend ?? 0),
    last_order_at:
      typeof row.last_order_at === "string" && row.last_order_at.trim().length
        ? row.last_order_at
        : null,
  }));
}
