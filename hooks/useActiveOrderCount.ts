"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";

// Counts ALL orders for the current user EXCEPT VOIDED/CANCELLED.
export function useActiveOrderCount() {
  const { user } = useAuth();
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { count: c, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("status", "in", "(CANCELLED,VOIDED)");

    if (error) {
      console.error("Failed to count orders:", error);
      setCount(0);
    } else {
      setCount(Number(c ?? 0));
    }

    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return { count, loading, reload };
}
