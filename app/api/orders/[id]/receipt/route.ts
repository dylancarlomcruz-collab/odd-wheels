import { NextResponse } from "next/server";
import { authorizeOrderAccess } from "../orderAccess";

const SUBMITTABLE_STATUSES = new Set([
  "AWAITING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_REVIEW",
]);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const authResult = await authorizeOrderAccess(req, id);
    if ("error" in authResult) return authResult.error;

    const body = await req.json().catch(() => null);
    const receiptUrl = String(
      body?.receiptUrl ?? body?.receipt_url ?? ""
    ).trim();

    if (!receiptUrl) {
      return NextResponse.json(
        { ok: false, error: "Receipt URL required." },
        { status: 400 }
      );
    }

    const paymentStatus = String(
      authResult.order?.payment_status ?? ""
    ).trim().toUpperCase();
    const status = String(authResult.order?.status ?? "").trim().toUpperCase();

    if (paymentStatus === "PAID") {
      return NextResponse.json(
        { ok: false, error: "Order already paid." },
        { status: 409 }
      );
    }

    if (
      status === "PENDING_APPROVAL" ||
      status === "PENDING_STAFF_APPROVAL" ||
      status === "PENDING"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Receipt upload will be available after staff approval.",
        },
        { status: 409 }
      );
    }

    if (!SUBMITTABLE_STATUSES.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Receipt upload is not available for this order." },
        { status: 409 }
      );
    }

    const { error } = await authResult.sb
      .from("orders")
      .update({
        receipt_url: receiptUrl,
        status: "PAYMENT_SUBMITTED",
        order_status: "PAYMENT_SUBMITTED",
        payment_hold: true,
      })
      .eq("id", authResult.order.id);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      orderId: authResult.order.id,
      status: "PAYMENT_SUBMITTED",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to submit receipt." },
      { status: 500 }
    );
  }
}
