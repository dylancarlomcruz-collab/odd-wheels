import { NextResponse } from "next/server";
import { requireStaffRequest } from "@/lib/api/auth";

const PREPARING_SHIPPING_STATUSES = [
  "PREPARING",
  "PREPARING_TO_SHIP",
  "PREPARING TO SHIP",
  "TO_SHIP",
  "PENDING_SHIPMENT",
  "NONE",
];

export async function GET(req: Request) {
  try {
    const authResult = await requireStaffRequest(req);
    if ("error" in authResult) return authResult.error;

    const { sb } = authResult;
    const [pendingOrders, sellTrade, preparingShipA, preparingShipB] =
      await Promise.all([
        sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING_APPROVAL"),
        sb
          .from("sell_trade_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING"),
        sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .in("shipping_status", PREPARING_SHIPPING_STATUSES),
        sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .is("shipping_status", null),
      ]);

    const firstError =
      pendingOrders.error ||
      sellTrade.error ||
      preparingShipA.error ||
      preparingShipB.error;
    if (firstError) {
      return NextResponse.json(
        {
          ok: false,
          error: firstError.message || "Failed to load staff navigation counts.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        counts: {
          pendingApproval: Number(pendingOrders.count ?? 0),
          sellTradePending: Number(sellTrade.count ?? 0),
          pendingShipping:
            Number(preparingShipA.count ?? 0) +
            Number(preparingShipB.count ?? 0),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load staff navigation counts.",
      },
      { status: 500 }
    );
  }
}
