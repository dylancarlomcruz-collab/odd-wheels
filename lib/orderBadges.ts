export type BadgeTone =
  | "warning"
  | "success"
  | "info"
  | "neutral"
  | "danger"
  | "accent";

export type OrderBadge = { label: string; tone: BadgeTone };

export type OrderBadgeInput = {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  shipping_status?: string | null;
  priority_requested?: boolean | null;
  priority_approved?: boolean | null;
  priority_fee?: number | null;
};

export function formatStatusLabel(raw: string | null | undefined) {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned) return "-";
  return cleaned
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function normalizeShippingStatus(raw: string | null | undefined) {
  const status = String(raw ?? "").trim().toUpperCase();
  if (!status || status === "NONE") return null;
  if (status === "PREPARING" || status === "PREPARING_TO_SHIP") {
    return "PREPARING_TO_SHIP";
  }
  if (status === "TO_SHIP" || status === "PENDING_SHIPMENT") {
    return "PREPARING_TO_SHIP";
  }
  return status;
}

export function badgeToneClass(tone: BadgeTone) {
  switch (tone) {
    case "success":
      return "border-emerald-400/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100";
    case "info":
      return "border-sky-400/70 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100";
    case "warning":
      return "border-amber-400/70 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100";
    case "danger":
      return "border-red-400/70 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100";
    case "accent":
      return "border-accent-400/70 bg-accent-50 text-accent-800 dark:border-accent-500/40 dark:bg-accent-500/10 dark:text-accent-100";
    case "neutral":
    default:
      return "border-slate-300/70 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white/80";
  }
}

function orderStatusBadge(status: string) {
  switch (status) {
    case "PENDING_APPROVAL":
    case "PENDING_STAFF_APPROVAL":
    case "PENDING":
      return { label: "Pending approval", tone: "warning" as const };
    case "AWAITING_PAYMENT":
      return { label: "Awaiting payment", tone: "warning" as const };
    case "PAYMENT_SUBMITTED":
      return { label: "Payment submitted", tone: "info" as const };
    case "PAYMENT_REVIEW":
      return { label: "Payment review", tone: "info" as const };
    case "RESERVED":
      return { label: "Reserved", tone: "info" as const };
    case "APPROVED":
    case "ORDER_APPROVED":
      return { label: "Approved", tone: "info" as const };
    case "SHIPPED":
      return { label: "Shipped", tone: "info" as const };
    case "COMPLETED":
      return { label: "Completed", tone: "success" as const };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" as const };
    case "VOIDED":
      return { label: "Voided", tone: "danger" as const };
    default:
      return null;
  }
}

function shippingStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return { label: "Completed", tone: "success" as const };
    case "SHIPPED":
      return { label: "Shipped", tone: "info" as const };
    case "PREPARING_TO_SHIP":
    default:
      return { label: "Preparing to ship", tone: "info" as const };
  }
}

export function getBadges(order: OrderBadgeInput): OrderBadge[] {
  const badges: OrderBadge[] = [];
  const status = String(order.status ?? "").trim().toUpperCase();
  const paymentStatus =
    String(order.payment_status ?? "").trim().toUpperCase() || "UNPAID";
  const paymentMethod = String(order.payment_method ?? "").trim();
  const shippingStatus = normalizeShippingStatus(order.shipping_status);
  const isPaid = paymentStatus === "PAID";
  const isCancelled = status === "CANCELLED" || status === "VOIDED";
  const priorityRequested =
    Boolean(order.priority_requested) || Number(order.priority_fee ?? 0) > 0;

  const statusBadge = orderStatusBadge(status);
  const shippingBadge =
    !isCancelled && isPaid && shippingStatus
      ? shippingStatusBadge(shippingStatus)
      : null;

  if (
    statusBadge &&
    (!shippingBadge || statusBadge.label !== shippingBadge.label)
  ) {
    badges.push(statusBadge);
  }

  badges.push({
    label: paymentStatus === "PAID" ? "Paid" : "Unpaid",
    tone: paymentStatus === "PAID" ? "success" : "warning",
  });

  if (paymentMethod) {
    badges.push({ label: paymentMethod, tone: "neutral" });
  }

  if (shippingBadge) {
    badges.push(shippingBadge);
  }

  if (priorityRequested) {
    badges.push({
      label: order.priority_approved ? "Priority approved" : "Priority pending",
      tone: order.priority_approved ? "accent" : "warning",
    });
  }

  return badges;
}
