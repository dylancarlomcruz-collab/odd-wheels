"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useProfile, type Role } from "@/hooks/useProfile";
import { RequireAuth } from "@/components/auth/RequireAuth";

export function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RoleGate allow={allow}>{children}</RoleGate>
    </RequireAuth>
  );
}

function RoleGate({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { profile, loading } = useProfile();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && profile && !allow.includes(profile.role)) {
      router.replace("/");
    }
  }, [loading, profile, allow, router]);

  if (loading) return <div className="p-6 text-white/70">Loading...</div>;
  if (!profile) return <div className="p-6 text-white/70">Profile not found. Ask admin to assign your role.</div>;
  if (!allow.includes(profile.role)) return null;

  return <>{children}</>;
}
