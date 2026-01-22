"use client";

export default function FAQPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-4 text-white/70">
      <div>
        <div className="text-2xl font-semibold text-white">FAQ</div>
        <div className="text-sm text-white/50">
          Quick answers about orders, shipping, and shop policies.
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-bg-900/50 p-5 space-y-3">
        <div>
          <div className="text-sm font-semibold text-white">How long does shipping take?</div>
          <div className="text-sm text-white/60">
            Delivery times vary by carrier and location. You will receive updates
            after checkout.
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Can I request hold or pickup?</div>
          <div className="text-sm text-white/60">
            Yes. Use checkout notes or contact us to arrange a pickup slot.
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Are items brand new?</div>
          <div className="text-sm text-white/60">
            We label items by condition (sealed, unsealed, etc.) on each listing.
          </div>
        </div>
      </div>
    </main>
  );
}
