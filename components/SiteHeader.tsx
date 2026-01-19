"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  User2,
  Shield,
  Settings,
  ArrowLeftRight,
  Menu,
  X,
  ClipboardList,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useActiveOrderCount } from "@/hooks/useActiveOrderCount";
import { useCart } from "@/hooks/useCart";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/lib/supabase/browser";
import {
  getSearchHistory,
  normalizeSearchTerm,
  rememberSearchTerm,
} from "@/lib/search";

type SearchSuggestion = {
  id: string;
  term: string;
  source: "recent" | "popular";
};

export function SiteHeader() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const router = useRouter();
  const sp = useSearchParams();
  const searchParamQ = sp.get("q") ?? "";
  const [q, setQ] = React.useState(searchParamQ);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
  const [trending, setTrending] = React.useState<string[]>([]);
  const [activeSearch, setActiveSearch] = React.useState<"desktop" | "mobile" | null>(
    null
  );
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const searchRefs = React.useRef<{ desktop: HTMLDivElement | null; mobile: HTMLDivElement | null }>({
    desktop: null,
    mobile: null,
  });

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
    setQ(searchParamQ);
  }, [searchParamQ]);

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

  function runSearch(term: string, target: "shop" | "advanced") {
    const value = term.trim();
    if (!value) return;
    const normalized = normalizeSearchTerm(value);
    rememberSearchTerm(value);
    supabase
      .rpc("log_search_term", {
        p_term: value,
        p_normalized: normalized || value,
      })
      .then(
        () => undefined,
        (err) => console.error("Failed to log search", err)
      );
    const targetPath =
      target === "advanced"
        ? `/search?q=${encodeURIComponent(value)}`
        : `/?q=${encodeURIComponent(value)}`;
    router.push(targetPath);
    setActiveSearch(null);
    setActiveIndex(-1);
  }

  function openAdvancedSearch() {
    const term = q.trim();
    if (term) {
      runSearch(term, "advanced");
      return;
    }
    router.push("/search");
    setActiveSearch(null);
    setActiveIndex(-1);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(q, "shop");
  }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc("get_trending_searches", {
        p_days: 7,
        p_limit: 6,
      });
      if (!mounted) return;
      const terms = (data as any[] | null)?.map((row) => String(row.term ?? "").trim()).filter(Boolean) ?? [];
      setTrending(terms);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!activeSearch) return;
    const term = q.trim();
    const normalizedTerm = normalizeSearchTerm(term);
    const recent = getSearchHistory(6);
    const next: SearchSuggestion[] = [];
    const seen = new Set<string>();
    const matches = (value: string) => {
      if (!normalizedTerm) return true;
      const normalizedValue = normalizeSearchTerm(value);
      return normalizedValue.includes(normalizedTerm);
    };

    for (const value of recent) {
      if (!value || seen.has(value) || !matches(value)) continue;
      next.push({ id: `recent:${value}`, term: value, source: "recent" });
      seen.add(value);
    }

    for (const value of trending) {
      if (!value || seen.has(value) || !matches(value)) continue;
      next.push({ id: `popular:${value}`, term: value, source: "popular" });
      seen.add(value);
    }

    setSuggestions(next.slice(0, 6));
    setActiveIndex(-1);
  }, [q, activeSearch, trending]);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const containers = Object.values(searchRefs.current).filter(Boolean) as HTMLElement[];
      const inside = containers.some((node) => node.contains(target));
      if (!inside) {
        setActiveSearch(null);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pickSearchTerm(term: string) {
    const value = term.trim();
    if (!value) return;
    setQ(value);
    runSearch(value, "shop");
  }

  function onSearchKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    list: SearchSuggestion[]
  ) {
    if (!list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, list.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    }
    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const selected = list[activeIndex];
      if (selected?.term) pickSearchTerm(selected.term);
    }
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
          <div
            ref={(node) => {
              searchRefs.current.desktop = node;
            }}
            className="relative"
          >
            <form onSubmit={submitSearch} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search brand, model, keyword..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setActiveSearch("desktop")}
                  onKeyDown={(e) => onSearchKeyDown(e, suggestions)}
                />
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-bg-950/40 text-white/80 hover:bg-bg-950/60"
              >
                <Search className="h-4 w-4" />
              </button>
            </form>
            {activeSearch === "desktop" ? (
              <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft p-3 z-40">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Search suggestions</span>
                </div>
                {q.trim() ? (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => runSearch(q, "shop")}
                      className="flex w-full items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100 hover:bg-amber-500/20"
                    >
                      <span className="font-medium">
                        Search for "{q.trim()}"
                      </span>
                      <Search className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openAdvancedSearch}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-left text-xs text-white/70 hover:bg-bg-950/60"
                    >
                      <span>Advanced filters</span>
                      <span className="text-[10px] uppercase tracking-wide text-white/40">
                        /search
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={openAdvancedSearch}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-left text-xs text-white/70 hover:bg-bg-950/60"
                    >
                      <span>Advanced filters</span>
                      <span className="text-[10px] uppercase tracking-wide text-white/40">
                        /search
                      </span>
                    </button>
                  </div>
                )}
                {suggestions.length ? (
                  <div className="mt-2 space-y-2">
                    {suggestions.map((s, index) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickSearchTerm(s.term)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
                          index === activeIndex
                            ? "border-amber-400/50 bg-amber-500/10"
                            : "border-white/10 bg-bg-950/40 hover:bg-bg-950/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium line-clamp-1">{s.term}</div>
                          <div className="text-[11px] text-white/50">
                            {s.source === "recent" ? "Your recent searches" : "Popular searches"}
                          </div>
                        </div>
                        <Search className="h-4 w-4 text-white/40" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-white/50">
                    {q.trim()
                      ? "No saved searches yet. Press Enter to search."
                      : "Start typing to search."}
                  </div>
                )}

                {trending.length ? (
                  <div className="mt-3">
                    <div className="text-xs text-white/50">Popular searches</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {trending.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => pickSearchTerm(term)}
                          className="rounded-full border border-white/10 bg-bg-950/40 px-3 py-1 text-[11px] text-white/70 hover:bg-bg-950/60"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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
        <div
          ref={(node) => {
            searchRefs.current.mobile = node;
          }}
          className="relative"
        >
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Search brand, model, keyword..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setActiveSearch("mobile")}
                onKeyDown={(e) => onSearchKeyDown(e, suggestions)}
              />
            </div>
            <button
              type="submit"
              aria-label="Search"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-bg-950/40 text-white/80 hover:bg-bg-950/60"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
          {activeSearch === "mobile" ? (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft p-3 z-40">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Search suggestions</span>
              </div>
              {q.trim() ? (
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => runSearch(q, "shop")}
                    className="flex w-full items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100 hover:bg-amber-500/20"
                  >
                    <span className="font-medium">
                      Search for "{q.trim()}"
                    </span>
                    <Search className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openAdvancedSearch}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-left text-xs text-white/70 hover:bg-bg-950/60"
                  >
                    <span>Advanced filters</span>
                    <span className="text-[10px] uppercase tracking-wide text-white/40">
                      /search
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={openAdvancedSearch}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-left text-xs text-white/70 hover:bg-bg-950/60"
                  >
                    <span>Advanced filters</span>
                    <span className="text-[10px] uppercase tracking-wide text-white/40">
                      /search
                    </span>
                  </button>
                </div>
              )}
              {suggestions.length ? (
                <div className="mt-2 space-y-2">
                  {suggestions.map((s, index) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickSearchTerm(s.term)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
                        index === activeIndex
                          ? "border-amber-400/50 bg-amber-500/10"
                          : "border-white/10 bg-bg-950/40 hover:bg-bg-950/60"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium line-clamp-1">{s.term}</div>
                        <div className="text-[11px] text-white/50">
                          {s.source === "recent" ? "Your recent searches" : "Popular searches"}
                        </div>
                      </div>
                      <Search className="h-4 w-4 text-white/40" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-white/50">
                  {q.trim()
                    ? "No saved searches yet. Press Enter to search."
                    : "Start typing to search."}
                </div>
              )}

              {trending.length ? (
                <div className="mt-3">
                  <div className="text-xs text-white/50">Popular searches</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trending.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => pickSearchTerm(term)}
                        className="rounded-full border border-white/10 bg-bg-950/40 px-3 py-1 text-[11px] text-white/70 hover:bg-bg-950/60"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
