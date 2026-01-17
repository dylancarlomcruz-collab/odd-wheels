import { Suspense } from "react";
import SearchContent from "./SearchContent";

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Suspense fallback={<div className="text-white/60">Loading search...</div>}>
        <SearchContent />
      </Suspense>
    </main>
  );
}
