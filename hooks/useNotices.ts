"use client";

import * as React from "react";
import { isSupabaseReady, supabase } from "@/lib/supabase/browser";

export type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export function useNotices(limit = 5) {
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!isSupabaseReady || !supabase) {
        setNotices([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!mounted) return;

      if (error) {
        console.error("Failed to load notices:", error);
        setNotices([]);
      } else {
        setNotices((data as any) ?? []);
      }
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [limit]);

  return { notices, loading };
}
