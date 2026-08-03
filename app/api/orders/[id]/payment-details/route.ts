import { NextResponse } from "next/server";
import { authorizeOrderAccess } from "../orderAccess";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const authResult = await authorizeOrderAccess(req, id);
    if ("error" in authResult) return authResult.error;

    const methodCode = String(authResult.order?.payment_method ?? "").trim();
    if (!methodCode) {
      return NextResponse.json({
        ok: true,
        paymentMethod: null,
      });
    }

    const { data, error } = await authResult.sb
      .from("payment_methods")
      .select(
        "id,method,label,account_number,account_name,instructions,qr_image_url,is_active"
      )
      .eq("method", methodCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      paymentMethod: data ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to load payment details." },
      { status: 500 }
    );
  }
}
