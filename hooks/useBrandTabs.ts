"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";

export type BrandTab = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export function useBrandTabs() {
  const [brands, setBrands] = React.useState<BrandTab[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      const { data, error } = await supabase
        .from("brand_tabs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("Failed to load brand tabs:", error);
        setBrands([]);
      } else {
        setBrands((data as any) ?? []);
      }
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  return { brands, loading };
}
