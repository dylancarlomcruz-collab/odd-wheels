import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildPublicShipmentView,
  isPublicShipmentEligible,
  normalizePublicCustomerName,
  resolvePublicCustomerName,
  type PublicShipmentSourceRow,
} from "@/lib/publicShippedOrders";

async function resolveOptionalAdmin(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: true as const, isAdmin: false };
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: true as const, isAdmin: false };
  }

  return {
    ok: true as const,
    isAdmin: String(profile.role ?? "") === "admin",
  };
}

async function loadBoardRows(isAdmin: boolean) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("orders")
    .select(
      "id,created_at,customer_name,status,order_status,shipping_method,shipping_details,shipping_status,courier,tracking_number,shipped_at,completed_at,shipping_region,address,cop_fee",
    )
    .order("shipped_at", { ascending: false, nullsFirst: false })
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1500);

  if (error) throw error;

  const now = new Date();
  return ((data as PublicShipmentSourceRow[] | null) ?? [])
    .filter((row) => isPublicShipmentEligible(row))
    .map((source) => {
      const view = buildPublicShipmentView(source, now);
      return view ? { source, view } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(({ view }) => isAdmin || !view.isOlderThanMonth)
    .sort(
      (a, b) =>
        new Date(b.view.referenceDate).getTime() -
        new Date(a.view.referenceDate).getTime(),
    );
}

export async function GET(req: Request) {
  try {
    const access = await resolveOptionalAdmin(req);
    if (!access.ok) return access.response;

    const rows = await loadBoardRows(access.isAdmin);

    const payloadRows = access.isAdmin
      ? rows.map(({ view }) => view)
      : rows.map(({ view }) => {
          const { admin, ...rest } = view;
          return rest;
        });

    return NextResponse.json({
      ok: true,
      isAdmin: access.isAdmin,
      rows: payloadRows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to load shipped orders." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await resolveOptionalAdmin(req);
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as
      | { fullName?: string }
      | null;
    const fullName = String(body?.fullName ?? "").trim();
    const normalizedFullName = normalizePublicCustomerName(fullName);

    if (normalizedFullName.length < 4) {
      return NextResponse.json(
        { ok: false, error: "Enter the full customer name used on the order." },
        { status: 400 },
      );
    }

    const rows = await loadBoardRows(access.isAdmin);
    const matches = rows
      .filter(
        ({ source }) =>
          normalizePublicCustomerName(resolvePublicCustomerName(source)) ===
          normalizedFullName,
      )
      .map(({ view, source }) => ({
        id: view.id,
        customerName: resolvePublicCustomerName(source),
        locationLabel: view.locationLabel,
        shippingMethodLabel: view.shippingMethodLabel,
        packageLabel: view.packageLabel,
        shippingStatus: view.shippingStatus,
        trackingNumber: String(source.tracking_number ?? "").trim() || null,
        shippedAt: view.shippedAt,
        shipmentDateLabel: view.shipmentDateLabel,
        estimatedDeliveryLabel: view.estimatedDeliveryLabel,
      }));

    return NextResponse.json({
      ok: true,
      isAdmin: access.isAdmin,
      matches,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to search shipped orders." },
      { status: 500 },
    );
  }
}
