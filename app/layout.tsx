import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { Suspense } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Odd Wheels PH",
  description: "Odd Wheels PH",
  icons: {
    icon: "/odd-wheels-logo.png",
    shortcut: "/odd-wheels-logo.png",
    apple: "/odd-wheels-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
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
                <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-white/50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>© 2026 Odd Wheels. All rights reserved.</div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/terms"
                      className="text-white/60 hover:text-white/80"
                    >
                      Terms of Service
                    </Link>
                    <span className="text-white/30">•</span>
                    <Link
                      href="/privacy"
                      className="text-white/60 hover:text-white/80"
                    >
                      Privacy Policy
                    </Link>
                  </div>
                </div>
              </footer>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
