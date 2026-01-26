"use client";

import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ShoppingCart,
  User2,
  Shield,
  Settings,
  ArrowLeftRight,
  Menu,
  X,
  ClipboardList,
  Search,
  PackageSearch,
  LayoutGrid,
  FileSpreadsheet,
  Truck,
  ShoppingBag,
  BarChart3,
  ScanBarcode,
  Tags,
  StickyNote,
  QrCode,
  Settings2,
  ScanLine,
  Crown,
  Bug,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useActiveOrderCount } from "@/hooks/useActiveOrderCount";
import { useCart } from "@/hooks/useCart";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/lib/supabase/browser";
import { useShopSort } from "@/hooks/useShopSort";
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

const SHOP_SORT_OPTIONS: Array<{ value: "relevance" | "newest" | "popular"; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
];

export function SiteHeader() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const { sortBy, setSortBy, priceDir, setPriceDir } = useShopSort();
  const searchParamQ = sp.get("q") ?? "";
  const [q, setQ] = React.useState(searchParamQ);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuPortalReady, setMenuPortalReady] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
  const [trending, setTrending] = React.useState<string[]>([]);
  const [activeSearch, setActiveSearch] = React.useState<"desktop" | "mobile" | null>(
    null
  );
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [staffCounts, setStaffCounts] = React.useState({
    pendingApproval: 0,
    sellTradePending: 0,
    pendingShipping: 0,
  });
  const [bugOpen, setBugOpen] = React.useState(false);
  const [bugDetails, setBugDetails] = React.useState("");
  const [bugError, setBugError] = React.useState<string | null>(null);
  const [bugSent, setBugSent] = React.useState(false);
  const [bugSending, setBugSending] = React.useState(false);
  const headerRef = React.useRef<HTMLElement | null>(null);
  const searchRefs = React.useRef<{ desktop: HTMLDivElement | null; mobile: HTMLDivElement | null }>({
    desktop: null,
    mobile: null,
  });

  const isStaff = profile?.role === "admin" || profile?.role === "cashier";
  const staffOrdersHref =
    profile?.role === "admin" ? "/admin/orders" : "/cashier/orders";
  const staffShippingHref =
    profile?.role === "admin" ? "/admin/shipments" : "/cashier/shipments";

  const { count: orderCount } = useActiveOrderCount();
  const orderCountLabel = orderCount > 99 ? "99+" : String(orderCount);
  const { lines: cartLines } = useCart();
  const cartCount = React.useMemo(
    () => cartLines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0),
    [cartLines]
  );
  const cartCountLabel = cartCount > 99 ? "99+" : String(cartCount);
  const logoUrl = settings?.header_logo_url?.trim() || "/odd-wheels-logo.png";
  const staffTotal =
    staffCounts.pendingApproval +
    staffCounts.sellTradePending +
    staffCounts.pendingShipping;
  const menuBadgeCount = isStaff ? staffTotal : orderCount;
  const menuBadgeLabel = menuBadgeCount > 99 ? "99+" : String(menuBadgeCount);
  const showShopSort = pathname === "/";

  React.useEffect(() => {
    setQ(searchParamQ);
  }, [searchParamQ]);

  React.useEffect(() => {
    setMenuPortalReady(true);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const node = headerRef.current;
    if (!node) return;
    const updateHeight = () => {
      const height = node.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--shop-header-height",
        `${height}px`
      );
    };
    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  React.useEffect(() => {
    if (menuOpen) return;
    setBugOpen(false);
    setBugError(null);
    setBugSent(false);
  }, [menuOpen]);

  const submitBugReport = React.useCallback(async () => {
    const message = bugDetails.trim();
    if (!message) {
      setBugError("Add a short description before sending.");
      setBugSent(false);
      return;
    }

    setBugSending(true);
    setBugError(null);
    setBugSent(false);

    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const { error } = await supabase.rpc("fn_report_bug", {
      p_message: message,
      p_page_url: pageUrl || null,
      p_user_email: user?.email ?? null,
      p_user_agent: userAgent || null,
    });

    if (error) {
      setBugError(error.message || "Failed to send bug report.");
      setBugSent(false);
      setBugSending(false);
      return;
    }

    setBugDetails("");
    setBugSent(true);
    setBugSending(false);
  }, [bugDetails, user?.email]);

  const mobileMenuItems = [
    { key: "announcements", href: "/announcements", label: "Announcements", icon: StickyNote, show: true },
    { key: "sell-trade", href: "/sell-trade", label: "Sell/Trade", icon: ArrowLeftRight, show: true },
    { key: "orders", href: "/orders", label: "Orders", icon: ClipboardList, show: Boolean(user) },
      { key: "account", href: "/account", label: "Account", icon: Settings, show: Boolean(user) },
      {
        key: "tier-vouchers",
        href: "/account/tiers",
        label: "Tier & Vouchers",
        icon: Crown,
        show: Boolean(user),
      },
    { key: "logout", href: "/auth/logout", label: "Logout", icon: LogOut, show: Boolean(user) },
    { key: "login", href: "/auth/login", label: "Login", icon: User2, show: !user },
  ];

  const adminMenuItems = [
    { key: "admin-dashboard", href: "/admin", label: "Dashboard", icon: Shield },
    { key: "admin-inventory", href: "/admin/inventory", label: "Inventory", icon: PackageSearch },
    { key: "admin-inventory-browse", href: "/admin/inventory/browse", label: "Inventory Browse", icon: LayoutGrid },
    { key: "admin-inventory-sheet", href: "/admin/inventory/sheet", label: "Inventory Sheet", icon: FileSpreadsheet },
    {
      key: "admin-orders",
      href: "/admin/orders",
      label: "Orders / Approvals",
      icon: ClipboardList,
      badge: staffCounts.pendingApproval,
    },
    {
      key: "admin-shipments",
      href: "/admin/shipments",
      label: "Shipping Status",
      icon: Truck,
      badge: staffCounts.pendingShipping,
    },
    {
      key: "admin-sell-trade",
      href: "/admin/sell-trade",
      label: "Sell / Trade Offers",
      icon: ArrowLeftRight,
      badge: staffCounts.sellTradePending,
    },
    { key: "admin-sales", href: "/admin/sales", label: "Sales", icon: BarChart3 },
    { key: "admin-carts", href: "/admin/carts", label: "Cart Insights", icon: ShoppingCart },
    { key: "admin-pos", href: "/cashier", label: "POS (Cashier)", icon: ScanBarcode },
    { key: "admin-brands", href: "/admin/brands", label: "Brand Tabs", icon: Tags },
    { key: "admin-notices", href: "/admin/notices", label: "Notice Board", icon: StickyNote },
    { key: "admin-bug-reports", href: "/admin/bug-reports", label: "Bug Reports", icon: Bug },
    { key: "admin-payment-methods", href: "/admin/settings/payment-methods", label: "Payment Methods", icon: QrCode },
    { key: "admin-settings", href: "/admin/settings", label: "Settings", icon: Settings2 },
  ];

  const cashierMenuItems = [
    { key: "cashier-dashboard", href: "/cashier", label: "Dashboard", icon: ClipboardList },
    { key: "cashier-orders", href: "/cashier/orders", label: "Orders & Approvals", icon: ShoppingBag },
    { key: "cashier-shipments", href: "/cashier/shipments", label: "Shipping Status", icon: Truck },
    { key: "cashier-pos", href: "/cashier/pos", label: "POS Checkout", icon: ScanLine },
  ];

  const loadStaffCounts = React.useCallback(async () => {
    if (!isStaff) return;
    const [pendingOrders, sellTrade, preparingShipA, preparingShipB] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING_APPROVAL"),
        supabase
          .from("sell_trade_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .in("shipping_status", [
            "PREPARING",
            "PREPARING_TO_SHIP",
            "TO_SHIP",
            "PENDING_SHIPMENT",
            "NONE",
          ]),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .is("shipping_status", null),
      ]);

    setStaffCounts({
      pendingApproval: pendingOrders.count ?? 0,
      sellTradePending: sellTrade.count ?? 0,
      pendingShipping:
        (preparingShipA.count ?? 0) + (preparingShipB.count ?? 0),
    });
  }, [isStaff]);

  React.useEffect(() => {
    if (!isStaff) return;
    let active = true;
    const tick = async () => {
      if (!active) return;
      await loadStaffCounts();
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [isStaff, loadStaffCounts]);

  React.useEffect(() => {
    if (!menuOpen || !isStaff) return;
    void loadStaffCounts();
  }, [menuOpen, isStaff, loadStaffCounts]);

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-white/10 bg-bg-900/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
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
                  className="h-9 px-3 text-sm sm:h-10 sm:px-4 sm:text-base"
                />
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-bg-950/40 text-white/80 hover:bg-bg-950/60 sm:h-10 sm:w-10"
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
                      className="flex w-full items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
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
          {isStaff && staffTotal > 0 ? (
            <div className="hidden items-center gap-2 md:flex">
              {staffCounts.pendingApproval > 0 ? (
                <Link
                  href={staffOrdersHref}
                  aria-label="View pending orders"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-900 transition hover:border-amber-400/70 hover:bg-amber-500/20 dark:text-amber-100"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  {staffCounts.pendingApproval}
                </Link>
              ) : null}
              {profile?.role === "admin" && staffCounts.sellTradePending > 0 ? (
                <Link
                  href="/admin/sell-trade"
                  aria-label="View sell/trade offers"
                  className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-900 transition hover:border-sky-400/70 hover:bg-sky-500/20 dark:text-sky-100"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {staffCounts.sellTradePending}
                </Link>
              ) : null}
              {staffCounts.pendingShipping > 0 ? (
                <Link
                  href={staffShippingHref}
                  aria-label="View pending shipments"
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-900 transition hover:border-indigo-400/70 hover:bg-indigo-500/20 dark:text-indigo-100"
                >
                  <Truck className="h-3.5 w-3.5" />
                  {staffCounts.pendingShipping}
                </Link>
              ) : null}
            </div>
          ) : null}
          <ThemeToggle />

          <Link href="/cart">
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
            {menuBadgeCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full border border-bg-900/80 bg-accent-500 px-1 text-[10px] font-semibold leading-4 text-white">
                {menuBadgeLabel}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="md:hidden border-t border-white/10 px-3 py-2 sm:px-4 sm:py-3">
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
                className="h-9 px-3 text-sm sm:h-10 sm:px-4 sm:text-base"
              />
            </div>
            <button
              type="submit"
              aria-label="Search"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-bg-950/40 text-white/80 hover:bg-bg-950/60 sm:h-10 sm:w-10"
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
                    className="flex w-full items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
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
      {showShopSort ? (
        <div className="border-t border-white/10 bg-bg-900/90">
          <div className="mx-auto max-w-6xl px-3 py-2 sm:px-4">
            <div className="w-full">
              <div className="grid grid-cols-4 gap-1 sm:gap-2">
                {SHOP_SORT_OPTIONS.map((option) => {
                  const active = option.value === sortBy;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSortBy(option.value)}
                      aria-pressed={active}
                      className={[
                        "inline-flex h-7 w-full items-center justify-center rounded-lg border px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide transition sm:h-9 sm:px-3 sm:text-[11px]",
                        active
                          ? "border-amber-400/60 bg-amber-500/20 text-amber-900 dark:text-amber-100"
                          : "border-white/10 bg-bg-950/20 text-white/70 hover:bg-bg-950/40",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
                {(() => {
                  const active = sortBy === "price";
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (sortBy !== "price") {
                          setSortBy("price");
                          setPriceDir("asc");
                          return;
                        }
                        setPriceDir((prev) => (prev === "asc" ? "desc" : "asc"));
                      }}
                      aria-pressed={active}
                      className={[
                        "inline-flex h-7 w-full items-center justify-center rounded-lg border px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide transition sm:h-9 sm:px-3 sm:text-[11px]",
                        active
                          ? "border-amber-400/60 bg-amber-500/20 text-amber-900 dark:text-amber-100"
                          : "border-white/10 bg-bg-950/20 text-white/70 hover:bg-bg-950/40",
                      ].join(" ")}
                    >
                      <span className="inline-flex items-center justify-center gap-1">
                        <span>Price</span>
                        {!active ? (
                          <ArrowUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        ) : priceDir === "asc" ? (
                          <ArrowUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        ) : (
                          <ArrowDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        )}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </header>

      {menuOpen && menuPortalReady
        ? createPortal(
            <div className="fixed inset-0 z-[60]">
              <button
                type="button"
                className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              />
              <div className="absolute right-0 top-0 z-10 h-full w-[280px] max-w-[85vw] border-l border-white/10 bg-bg-900/95 shadow-2xl flex flex-col">
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
                <nav className="p-3 space-y-2 overflow-y-auto">
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
                            <Badge className="px-2 py-0.5 text-xs">
                              {orderCountLabel}
                            </Badge>
                          ) : null}
                        </Link>
                      );
                    })}
                  {profile?.role === "admin" ? (
                    <div className="pt-2">
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
                        Admin
                      </div>
                      <div className="space-y-2">
                        {adminMenuItems.map((item) => {
                          const Icon = item.icon;
                          const hasBadge = typeof item.badge === "number";
                          const badgeValue = hasBadge ? Number(item.badge ?? 0) : 0;
                          const badgeLabel = badgeValue > 99 ? "99+" : String(badgeValue);
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
                              {hasBadge ? (
                                <Badge className="px-2 py-0.5 text-xs">
                                  {badgeLabel}
                                </Badge>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {profile?.role === "cashier" ? (
                    <div className="pt-2">
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
                        Cashier
                      </div>
                      <div className="space-y-2">
                        {cashierMenuItems.map((item) => {
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
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="pt-2">
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
                      Support
                    </div>
                    <button
                      type="button"
                      onClick={() => setBugOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-bg-950/30 px-3 py-2 text-sm text-white/90 hover:bg-bg-950/50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Bug className="h-4 w-4" />
                        Report a bug
                      </span>
                      <span className="text-xs text-white/50">{bugOpen ? "Hide" : "Open"}</span>
                    </button>
                    {bugOpen ? (
                      <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-bg-950/40 p-3">
                        <Textarea
                          label="What happened?"
                          value={bugDetails}
                          onChange={(e) => setBugDetails(e.target.value)}
                          placeholder="Tell us what broke and what you expected."
                        />
                        {bugError ? (
                          <div className="text-xs text-red-200">{bugError}</div>
                        ) : null}
                        {bugSent ? (
                          <div className="text-xs text-emerald-200">
                            Thanks! Your report was sent to the admin.
                          </div>
                        ) : null}
                        <div className="flex items-center justify-end">
                          <Button
                            size="sm"
                            onClick={submitBugReport}
                            disabled={bugSending}
                          >
                            {bugSending ? "Sending..." : "Send report"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </nav>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
