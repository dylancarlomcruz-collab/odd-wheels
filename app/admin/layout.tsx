import { RequireRole } from "@/components/auth/RequireRole";
import { AdminNav } from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={["admin"]}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <aside className="md:sticky md:top-24 h-fit">
            <div className="mb-3 text-sm text-white/60">Admin Panel</div>
            <AdminNav />
          </aside>
          <section>{children}</section>
        </div>
      </main>
    </RequireRole>
  );
}
