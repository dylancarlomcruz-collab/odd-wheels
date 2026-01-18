"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  PackageSearch,
  Settings2,
  StickyNote,
  Tags,
  ShoppingBag,
  BarChart3,
  ShoppingCart,
  ScanBarcode,
  LayoutGrid,
  QrCode,
  FileSpreadsheet,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Dashboard", icon: ShoppingBag },
  { href: "/admin/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/admin/inventory/browse", label: "Inventory Browse", icon: LayoutGrid },
  { href: "/admin/inventory/sheet", label: "Inventory Sheet", icon: FileSpreadsheet },
  { href: "/admin/orders", label: "Orders / Approvals", icon: ShoppingBag },
  { href: "/admin/sell-trade", label: "Sell / Trade Offers", icon: ShoppingBag },
  { href: "/admin/sales", label: "Sales", icon: BarChart3 },
  { href: "/admin/carts", label: "Cart Insights", icon: ShoppingCart },
  { href: "/cashier", label: "POS (Cashier)", icon: ScanBarcode }, // quick access
  { href: "/admin/brands", label: "Brand Tabs", icon: Tags },
  { href: "/admin/notices", label: "Notice Board", icon: StickyNote },
  { href: "/admin/settings/payment-methods", label: "Payment Methods", icon: QrCode },
  { href: "/admin/settings", label: "Settings", icon: Settings2 },
];

export function AdminNav() {
  const path = usePathname();

  return (
    <nav className="space-y-1">
      {links.map((l) => {
        const active = path === l.href;
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition sm:py-2 sm:text-sm",
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

