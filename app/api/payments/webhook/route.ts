import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Webhook receiver for GCash/BPI.
 * After validating the webhook, call the RPC:
 *   select fn_process_paid_order('<order_id>');
 */
export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);

  // TODO: Verify webhook signature based on your payment provider.
  // const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  const orderId: string | undefined = payload?.order_id ?? payload?.orderId;
  const paymentStatus: string | undefined = payload?.status;

  if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });

  if (paymentStatus && paymentStatus !== "SUCCESS") {
    return NextResponse.json({ ok: true, ignored: true, reason: `status=${paymentStatus}` }, { status: 200 });
  }

  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.rpc("fn_process_paid_order", { p_order_id: orderId });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, processed: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 200 });
  }
}
