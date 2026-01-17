"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingCart, User2, Shield, Settings, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useActiveOrderCount } from "@/hooks/useActiveOrderCount";
import { useCart } from "@/hooks/useCart";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function SiteHeader() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");

  const isStaff = profile?.role === "admin" || profile?.role === "cashier";

  const { count: orderCount } = useActiveOrderCount();
  const { lines: cartLines } = useCart();
  const cartCount = React.useMemo(
    () => cartLines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0),
    [cartLines]
  );
  const cartCountLabel = cartCount > 99 ? "99+" : String(cartCount);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-bg-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-bg-800 border border-white/10 grid place-items-center overflow-hidden shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/odd-wheels-logo.png" alt="Odd Wheels" className="h-full w-full object-cover" />
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

          <Link href="/sell-trade">
            <Button variant="ghost" size="sm">
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Sell/Trade
            </Button>
          </Link>

          {user ? (
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="relative">
                Orders
                {orderCount > 0 ? (
                  <span className="ml-2 inline-flex items-center">
                    <Badge className="px-2 py-0.5 text-xs">{orderCount}</Badge>
                  </span>
                ) : null}
              </Button>
            </Link>
          ) : null}

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

          {!user ? (
            <Link href="/auth/login">
              <Button variant="secondary" size="sm">
                <User2 className="h-4 w-4 mr-2" />
                Login
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/account">
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Account
                </Button>
              </Link>

              {isStaff ? (
                <Link href={profile?.role === "admin" ? "/admin" : "/cashier"}>
                  <Button variant="ghost" size="sm">
                    <Shield className="h-4 w-4 mr-2" />
                    {profile?.role === "admin" ? "Admin" : "Cashier"}
                  </Button>
                </Link>
              ) : null}

            </div>
          )}
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
  );
}
