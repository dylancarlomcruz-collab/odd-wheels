import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { Suspense } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ShopSortProvider } from "@/hooks/useShopSort";

const inter = Inter({ subsets: ["latin"] });

const themeScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("theme");
    const theme = stored || "dark";
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: "Odd Wheels PH",
  description: "Odd Wheels PH",
  icons: {
    icon: "/odd-wheels-logo.png",
    shortcut: "/odd-wheels-logo.png",
    apple: "/odd-wheels-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <ShopSortProvider>
              <ToastProvider>
                <Suspense
                  fallback={
                    <div className="h-14 border-b border-white/10 bg-bg-900/80" />
                  }
                >
                  <SiteHeader />
                </Suspense>

                {children}

                <footer className="border-t border-white/10 mt-16">
                  <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-white/60 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-white">
                        Odd Wheels
                      </div>
                      <div className="text-xs text-white/50">
                        Collectibles shop for diecast, resin, and limited runs.
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Social
                      </div>
                      <a
                        href="https://www.facebook.com/oddwheels.mnl/"
                        target="_blank"
                        rel="noreferrer"
                        className="block text-white/70 hover:text-white"
                      >
                        Facebook
                      </a>
                      <a
                        href="https://www.instagram.com/oddwheels.mnl"
                        target="_blank"
                        rel="noreferrer"
                        className="block text-white/70 hover:text-white"
                      >
                        Instagram
                      </a>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Contact
                      </div>
                      <div className="text-white/70">
                        RSquare Mall, Vito Cruz-Taft, Malate, Manila
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Quick Links
                      </div>
                      <Link
                        href="/orders"
                        className="block text-white/70 hover:text-white"
                      >
                        Orders
                      </Link>
                      <Link
                        href="/sell-trade"
                        className="block text-white/70 hover:text-white"
                      >
                        Sell/Trade
                      </Link>
                      <Link
                        href="/faq"
                        className="block text-white/70 hover:text-white"
                      >
                        FAQ
                      </Link>
                    </div>
                  </div>
                  <div className="border-t border-white/10">
                    <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-white/50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>(c) 2026 Odd Wheels. All rights reserved.</div>
                      <div className="flex items-center gap-3">
                        <Link
                          href="/terms"
                          className="text-white/60 hover:text-white/80"
                        >
                          Terms of Service
                        </Link>
                        <span className="text-white/30">|</span>
                        <Link
                          href="/privacy"
                          className="text-white/60 hover:text-white/80"
                        >
                          Privacy Policy
                        </Link>
                      </div>
                    </div>
                  </div>
                </footer>
              </ToastProvider>
            </ShopSortProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
