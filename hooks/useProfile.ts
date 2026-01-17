"use client";

import * as React from "react";
import { isSupabaseReady, supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";

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
      if (!user || !isSupabaseReady) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error, status } = await supabase
        .from("profiles")
        .select(
          "id, role, full_name, username, contact_number, email, shipping_defaults, created_at"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Failed to load profile:", { status, error });
        setProfile(null);
      } else {
        setProfile((data as any) ?? null);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { profile, loading };
}
