"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShoppingBag, ClipboardCheck, ScanLine, Truck } from "lucide-react";

const links = [
  { href: "/cashier", label: "Dashboard", icon: ClipboardCheck },
  { href: "/cashier/orders", label: "Orders & Approvals", icon: ShoppingBag },
  { href: "/cashier/shipments", label: "Shipping Status", icon: Truck },
  { href: "/cashier/pos", label: "POS Checkout", icon: ScanLine },
];

export function CashierNav() {
  const path = usePathname();

  return (
    <nav className="space-y-1">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
              active
                ? "border-accent-500/40 bg-accent-500/15 text-accent-900 dark:text-accent-100"
                : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10"
            )}
          >
            <Icon className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

