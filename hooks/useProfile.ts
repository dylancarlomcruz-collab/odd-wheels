"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchAuthedJson } from "@/lib/api/client";

export type Role = "admin" | "cashier" | "buyer";

export type Profile = {
  id: string;
  role: Role;
  full_name: string | null;
  username: string | null;
  contact_number: string | null;
  email: string | null;
  shipping_defaults?: any;
  created_at?: string;
};

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const payload = await fetchAuthedJson<{ ok: true; profile: Profile | null }>(
          "/api/account/profile"
        );

        if (!mounted) return;
        setProfile(payload.profile ?? null);
      } catch (error) {
        if (!mounted) return;
        console.error("Failed to load profile:", error);
        setProfile(null);
      }

      if (mounted) {
        setLoading(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { profile, loading };
}
