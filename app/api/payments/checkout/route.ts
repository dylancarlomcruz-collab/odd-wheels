import { NextResponse } from "next/server";

/**
 * Creates a payment session/intent for GCash or BPI.
 * This is intentionally a stub. Implement according to your provider API.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const provider = body?.provider as string | undefined; // "GCASH" | "BPI"
  const orderId = body?.orderId as string | undefined;

  if (!provider || !orderId) {
    return NextResponse.json({ ok: false, error: "Missing provider or orderId" }, { status: 400 });
  }

  // TODO: Call provider API using your credentials and return a redirect URL / reference ID.
  return NextResponse.json({
    ok: false,
    error: "Payment provider integration not configured yet.",
    hint: "Implement provider API call here and return payment_url or reference_id.",
    provider,
    orderId
  }, { status: 200 });
}
