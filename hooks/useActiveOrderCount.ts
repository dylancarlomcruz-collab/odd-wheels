"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchAuthedJson } from "@/lib/api/client";

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

    try {
      const payload = await fetchAuthedJson<{ ok: true; count: number }>(
        "/api/account/orders/count"
      );
      setCount(Number(payload.count ?? 0));
    } catch (error) {
      console.error("Failed to count orders:", error);
      setCount(0);
    }

    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { count, loading, reload };
}
