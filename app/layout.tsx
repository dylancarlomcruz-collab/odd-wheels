import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { Suspense } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Odd Wheels POS",
  description: "Odd Wheels POS & E-Commerce",
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
                <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-white/50">
                  Ac {new Date().getFullYear()} Odd Wheels. Built for POS +
                  Online Sales.
                </div>
              </footer>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
