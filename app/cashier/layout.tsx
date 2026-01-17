import { RequireRole } from "@/components/auth/RequireRole";
import { CashierNav } from "@/components/CashierNav";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={["admin", "cashier"]}>
      <main className="admin-compact mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <div className="grid gap-4 sm:gap-6 md:grid-cols-[240px_1fr]">
          <aside className="md:sticky md:top-24 h-fit">
            <div className="mb-3 text-sm text-white/60">Cashier Panel</div>
            <CashierNav />
          </aside>
          <section>{children}</section>
        </div>
      </main>
    </RequireRole>
  );
}
