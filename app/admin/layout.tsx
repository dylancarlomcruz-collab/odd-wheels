import { RequireRole } from "@/components/auth/RequireRole";
import { AdminNav } from "@/components/AdminNav";
import { AdminMobileBar } from "@/components/admin/AdminMobileBar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allow={["admin"]}>
      <main className="admin-compact mx-auto max-w-8xl px-2 py-8 sm:px-4">
        <AdminMobileBar />
        <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden h-fit md:sticky md:top-24 md:block">
            <div className="mb-3 text-sm text-white/60">Admin Panel</div>
            <AdminNav />
          </aside>
          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </RequireRole>
  );
}
