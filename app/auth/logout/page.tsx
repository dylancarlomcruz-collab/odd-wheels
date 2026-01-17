"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function LogoutPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  React.useEffect(() => {
    signOut().finally(() => router.replace("/"));
  }, [signOut, router]);

  return <div className="p-6 text-white/70">Signing out...</div>;
}
