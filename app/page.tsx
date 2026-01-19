import { Suspense } from "react";
import ShopPageClient from "./ShopPageClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="px-3 py-5 sm:px-4 sm:py-6 text-white/60">
          Loading...
        </main>
      }
    >
      <ShopPageClient />
    </Suspense>
  );
}
