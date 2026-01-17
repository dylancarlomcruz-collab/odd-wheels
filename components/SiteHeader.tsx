"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingCart, User2, Shield, Settings, ArrowLeftRight, Menu, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useActiveOrderCount } from "@/hooks/useActiveOrderCount";
import { useCart } from "@/hooks/useCart";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useSettings } from "@/hooks/useSettings";

export function SiteHeader() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [menuOpen, setMenuOpen] = React.useState(false);

  const isStaff = profile?.role === "admin" || profile?.role === "cashier";

  const { count: orderCount } = useActiveOrderCount();
  const orderCountLabel = orderCount > 99 ? "99+" : String(orderCount);
  const { lines: cartLines } = useCart();
  const cartCount = React.useMemo(
    () => cartLines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0),
    [cartLines]
  );
  const cartCountLabel = cartCount > 99 ? "99+" : String(cartCount);
  const logoUrl = settings?.header_logo_url?.trim() || "/odd-wheels-logo.png";

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const href = logoUrl || "/odd-wheels-logo.png";

    const ensureLink = (rel: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
    };

    ensureLink("icon");
    ensureLink("shortcut icon");
    ensureLink("apple-touch-icon");
  }, [logoUrl]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const mobileMenuItems = [
    { key: "sell-trade", href: "/sell-trade", label: "Sell/Trade", icon: ArrowLeftRight, show: true },
    { key: "orders", href: "/orders", label: "Orders", icon: ClipboardList, show: Boolean(user) },
    { key: "account", href: "/account", label: "Account", icon: Settings, show: Boolean(user) },
    {
      key: "staff",
      href: profile?.role === "admin" ? "/admin" : "/cashier",
      label: profile?.role === "admin" ? "Admin" : "Cashier",
      icon: Shield,
      show: isStaff,
    },
    { key: "login", href: "/auth/login", label: "Login", icon: User2, show: !user },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-bg-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-bg-800 border border-white/10 grid place-items-center overflow-hidden shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Odd Wheels"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/odd-wheels-logo.png";
              }}
            />
          </div>
          <div>
            <div className="text-sm font-semibold leading-4">ODD WHEELS</div>
            <div className="text-xs text-white/50">Shop</div>
          </div>
        </Link>

        <div className="flex-1" />

        <div className="hidden md:block w-[360px]">
          <form onSubmit={submitSearch}>
            <Input
              placeholder="Search brand, model, keyword..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <Link
            href={user ? "/cart" : "/auth/login"}
            className={user ? "" : "pointer-events-none opacity-50"}
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label={cartCount ? `Cart (${cartCount} items)` : "Cart"}
              className="relative"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full border border-bg-900/80 bg-accent-500 px-1 text-[10px] font-semibold leading-4 text-white">
                  {cartCountLabel}
                </span>
              ) : null}
            </Button>
          </Link>

          <button
            type="button"
            className="relative inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm text-white hover:bg-paper/5"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
            {orderCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full border border-bg-900/80 bg-accent-500 px-1 text-[10px] font-semibold leading-4 text-white">
                {orderCountLabel}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="md:hidden border-t border-white/10 px-4 py-3">
        <form onSubmit={submitSearch}>
          <Input
            placeholder="Search brand, model, keyword..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute right-0 top-0 h-full w-[280px] max-w-[85vw] border-l border-white/10 bg-bg-900/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-xs text-white/80 hover:bg-bg-950/60"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
            <nav className="p-3 space-y-2">
              {mobileMenuItems
                .filter((item) => item.show)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-950/30 px-3 py-2 text-sm text-white/90 hover:bg-bg-950/50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {item.key === "orders" && orderCount > 0 ? (
                        <Badge className="px-2 py-0.5 text-xs">{orderCountLabel}</Badge>
                      ) : null}
                    </Link>
                  );
                })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
