"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";

export type Settings = {
  id: number;
  shipping_schedule_text: string | null;
  shipping_cutoff_text: string | null;
  priority_shipping_available: boolean;
  priority_shipping_note: string | null;
  pickup_schedule_text: string | null;
  pickup_unavailable: boolean;
  pickup_schedule: Record<string, string[]> | null;
  header_logo_url: string | null;
};

export function useSettings() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
      if (!mounted) return;
      if (error) {
        console.error("Failed to load settings:", error);
        setSettings(null);
      } else {
        setSettings((data as any) ?? null);
      }
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  return { settings, loading };
}
