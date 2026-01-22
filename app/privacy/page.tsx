export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <div className="text-sm text-white/60">Last updated: Jan 23, 2026</div>
      </div>

      <div className="space-y-4 text-sm text-white/80">
        <p>
          Odd Wheels collects information you provide during registration,
          checkout, and customer support, such as your name, contact details,
          order details, and shipping address.
        </p>
        <p>
          We use cookies and local storage to remember your cart, preferences,
          and session state. Guest carts are stored locally on your device until
          you check out, sign in, or clear your browser data.
        </p>
        <p>
          We also collect limited interaction data, such as product views,
          clicks, and add-to-cart events, to improve search, sorting, and
          product selection. We do not sell your personal information.
        </p>
        <p>
          Payment processing and delivery partners may receive the minimum
          information required to complete your transaction or shipment. We may
          share information to comply with legal obligations.
        </p>
        <p>
          You can request account data updates or deletion by contacting our
          support team.
        </p>
      </div>
    </main>
  );
}
