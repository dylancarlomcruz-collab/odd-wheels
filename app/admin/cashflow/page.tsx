"use client";

import * as React from "react";
import {
  BellRing,
  CalendarRange,
  Coins,
  ChevronRight,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ModalShell } from "@/components/ui/ModalShell";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { supabase } from "@/lib/supabase/browser";

type CashflowFlowType = "INCOME" | "EXPENSE";
type CashflowCategory =
  | "SALES"
  | "LOAN"
  | "MONTHLY_PAYMENT"
  | "ALLOWANCE_INCOME"
  | "ALLOWANCE_COST"
  | "BILL"
  | "EVENT_MATERIALS"
  | "SHIPPING_MATERIALS"
  | "INVENTORY_COST"
  | "OTHER";

type CashflowEntry = {
  id: string;
  entry_date: string;
  flow_type: CashflowFlowType;
  category: CashflowCategory;
  title: string;
  counterparty: string | null;
  amount: number;
  notes: string | null;
  is_recurring: boolean;
  source_type: string | null;
  source_key: string | null;
  source_meta: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CashflowFormState = {
  id: string | null;
  entry_date: string;
  flow_type: CashflowFlowType;
  category: CashflowCategory;
  title: string;
  counterparty: string;
  amount: string;
  notes: string;
  is_recurring: boolean;
  paid_for_month: string;
  source_meta: Record<string, unknown> | null;
};

type CashflowOrder = {
  id: string;
  created_at: string;
  paid_at: string | null;
  total: number;
  status: string | null;
  payment_status: string | null;
  channel: string | null;
  payment_method: string | null;
  customer_name: string | null;
  shipping_details: Record<string, unknown> | null;
};

type CashflowOrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  item_name: string | null;
  product_title: string | null;
  image_url: string | null;
  condition: string | null;
  qty: number;
  price_each: number | null;
  unit_price: number | null;
  cost_each: number | null;
  line_total: number | null;
  created_at: string;
};

type InventoryCostEvent = {
  id: string;
  variant_id: string;
  product_id: string;
  qty_added: number;
  unit_cost: number;
  subtotal: number;
  movement_type: string;
  actor_user_id: string | null;
  occurred_at: string;
  entry_date: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

type InventoryProduct = {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
};

type InventoryVariant = {
  id: string;
  condition: string | null;
  price: number | null;
  cost: number | null;
};

type InventoryEventFormState = {
  entry_date: string;
  occurred_at: string;
  qty_added: string;
  unit_cost: string;
  movement_type: string;
};

type CashLoan = {
  id: string;
  title: string;
  lender: string | null;
  principal_amount: number;
  term_months: number;
  monthly_payment: number;
  start_date: string;
  first_due_date: string;
  next_due_date: string | null;
  payment_day: number | null;
  reminder_days_before: number;
  months_paid: number;
  status: "ACTIVE" | "PAID" | "CANCELLED";
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CashLoanFormState = {
  title: string;
  lender: string;
  principal_amount: string;
  term_months: string;
  monthly_payment: string;
  start_date: string;
  first_due_date: string;
  reminder_days_before: string;
  notes: string;
};

function getStoredOrderItemTotal(item: CashflowOrderItem): number | null {
  const basePrice = item.price_each ?? item.unit_price;
  const numericTotal =
    item.line_total != null
      ? Number(item.line_total)
      : basePrice != null
        ? Number(basePrice) * Math.max(Number(item.qty) || 0, 0)
        : Number.NaN;

  if (!Number.isFinite(numericTotal) || numericTotal <= 0) return null;
  return numericTotal;
}

const FLOW_TYPE_OPTIONS: Array<{ value: CashflowFlowType; label: string }> = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
];

const CATEGORY_OPTIONS: Array<{
  value: CashflowCategory;
  label: string;
  flowType: CashflowFlowType | "BOTH";
}> = [
  { value: "SALES", label: "Sales", flowType: "INCOME" },
  { value: "LOAN", label: "Loan", flowType: "INCOME" },
  { value: "MONTHLY_PAYMENT", label: "Monthly Payment", flowType: "EXPENSE" },
  { value: "ALLOWANCE_INCOME", label: "Allowance Income", flowType: "INCOME" },
  { value: "ALLOWANCE_COST", label: "Allowance Cost", flowType: "EXPENSE" },
  { value: "BILL", label: "Bills", flowType: "EXPENSE" },
  { value: "EVENT_MATERIALS", label: "Event Materials", flowType: "EXPENSE" },
  { value: "SHIPPING_MATERIALS", label: "Shipping Materials", flowType: "EXPENSE" },
  { value: "INVENTORY_COST", label: "Inventory Cost", flowType: "EXPENSE" },
  { value: "OTHER", label: "Other", flowType: "BOTH" },
];

const MISSING_SCHEMA_COLUMN_PATTERN =
  /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i;
const MISSING_SQL_COLUMN_PATTERN =
  /column\s+(?:(?<table>[a-zA-Z0-9_]+)\.)?(?<column>[a-zA-Z0-9_]+)\s+does not exist/i;

const ORDER_DETAIL_COLUMNS = [
  "id",
  "created_at",
  "paid_at",
  "total",
  "status",
  "payment_status",
  "channel",
  "payment_method",
  "customer_name",
  "shipping_details",
] as const;

const ORDER_ITEM_DETAIL_COLUMNS = [
  "id",
  "order_id",
  "product_id",
  "variant_id",
  "item_name",
  "product_title",
  "image_url",
  "condition",
  "qty",
  "price_each",
  "unit_price",
  "cost_each",
  "line_total",
  "created_at",
] as const;

function getMissingSchemaColumn(error: unknown, table: string) {
  const message = String((error as { message?: string } | null)?.message ?? "");
  const schemaMatch = message.match(MISSING_SCHEMA_COLUMN_PATTERN);
  if (schemaMatch) {
    const [, column, sourceTable] = schemaMatch;
    if (sourceTable && sourceTable !== table) return null;
    return column;
  }

  const sqlMatch = message.match(MISSING_SQL_COLUMN_PATTERN);
  const sqlGroups = sqlMatch?.groups;
  if (!sqlGroups?.column) return null;
  if (sqlGroups.table && sqlGroups.table !== table) return null;
  return sqlGroups.column;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return fallback;
}

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `PHP ${n.toFixed(2)}`;
  }
}

function ymd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthBounds() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(from), to: ymd(to) };
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDate(value: string) {
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCondition(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ");
}

function getManilaDayRange(value: string) {
  return {
    start: new Date(`${value}T00:00:00+08:00`).toISOString(),
    end: new Date(`${value}T24:00:00+08:00`).toISOString(),
  };
}

function getInitialFormState(): CashflowFormState {
  return {
    id: null,
    entry_date: ymd(new Date()),
    flow_type: "EXPENSE",
    category: "INVENTORY_COST",
    title: "",
    counterparty: "",
    amount: "",
    notes: "",
    is_recurring: false,
    paid_for_month: "",
    source_meta: null,
  };
}

function addMonthsToDateString(value: string, months: number) {
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return ymd(shifted);
}

function getMonthValueFromDateString(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return value;
}

function getDateStringForMonthDay(monthValue: string, day: number) {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return monthValue;
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, lastDay)
  ).padStart(2, "0")}`;
}

function formatMonthValue(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function extractPaidForMonthFromNotes(notes: string | null | undefined) {
  const text = String(notes ?? "").trim();
  if (!text) return "";

  const paidMonthMatch = text.match(/^Paid for ([A-Za-z]{3,9}\s+\d{4})\.\s*/i);
  if (paidMonthMatch) {
    const parsed = new Date(`${paidMonthMatch[1]} 1`);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    }
  }

  const dueDateMatch = text.match(/Logged against due date ([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\.?/i);
  if (dueDateMatch) {
    const parsed = new Date(dueDateMatch[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    }
  }

  return "";
}

function getPaidForMonth(entry: CashflowEntry) {
  if (entry.category !== "MONTHLY_PAYMENT") return "";

  const raw = entry.source_meta?.paid_for_month;
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  return extractPaidForMonthFromNotes(entry.notes);
}

function stripMonthlyPaymentNotes(notes: string | null | undefined) {
  const text = String(notes ?? "").trim();
  if (!text) return "";

  return text
    .replace(/^Paid on [A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\.\s*/i, "")
    .replace(/^Paid for [A-Za-z]{3,9}\s+\d{4}\.\s*/i, "")
    .replace(/^Logged against due date [A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\.\s*/i, "")
    .trim();
}

function buildMonthlyPaymentNotes(
  entryDate: string,
  paidForMonth: string,
  notes: string,
) {
  const segments: string[] = [];
  const paidOnDate = parseDateValue(entryDate);

  if (!Number.isNaN(paidOnDate.getTime())) {
    segments.push(`Paid on ${formatDate(entryDate)}.`);
  }

  if (paidForMonth) {
    segments.push(`Paid for ${formatMonthValue(paidForMonth)}.`);
  }

  if (notes) {
    segments.push(notes);
  }

  return segments.join(" ").trim();
}

function isSpayLaterLoanTitle(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized.includes("spaylater");
}

function getDaysUntilDate(value: string | null) {
  if (!value) return null;
  const target = parseDateValue(value);
  const today = parseDateValue(ymd(new Date()));
  if (Number.isNaN(target.getTime()) || Number.isNaN(today.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function getInitialLoanFormState(): CashLoanFormState {
  const today = ymd(new Date());
  return {
    title: "",
    lender: "",
    principal_amount: "",
    term_months: "12",
    monthly_payment: "",
    start_date: today,
    first_due_date: addMonthsToDateString(today, 1),
    reminder_days_before: "3",
    notes: "",
  };
}

function getLoanFormStateFromLoan(loan: CashLoan): CashLoanFormState {
  return {
    title: loan.title,
    lender: loan.lender ?? "",
    principal_amount: String(loan.principal_amount ?? ""),
    term_months: String(loan.term_months ?? ""),
    monthly_payment: String(loan.monthly_payment ?? ""),
    start_date: loan.start_date,
    first_due_date: loan.first_due_date,
    reminder_days_before: String(loan.reminder_days_before ?? 3),
    notes: loan.notes ?? "",
  };
}

function categoryLabel(category: CashflowCategory) {
  return (
    CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
    category.replaceAll("_", " ")
  );
}

function isAutomaticEntry(entry: CashflowEntry) {
  return (
    entry.source_type === "INVENTORY_DAILY_SUBTOTAL" ||
    entry.source_type === "INVENTORY_COST_EVENT" ||
    entry.source_type === "SALES_DAILY_SUBTOTAL"
  );
}

function normalizeCashflowEntries(rawEntries: CashflowEntry[]) {
  const entries = rawEntries.map((entry) => ({
    ...entry,
    amount: Number(entry.amount ?? 0),
  }));
  const inventoryDates = new Set(
    entries
      .filter(
        (entry) =>
          entry.source_type === "INVENTORY_COST_EVENT" ||
          entry.source_type === "INVENTORY_DAILY_SUBTOTAL"
      )
      .map((entry) => entry.entry_date)
  );

  const combinedInventoryEntries = new Map<string, CashflowEntry>();
  for (const entryDate of inventoryDates) {
    const sameDayInventoryEntries = entries.filter(
      (entry) =>
        entry.entry_date === entryDate &&
        (entry.source_type === "INVENTORY_COST_EVENT" ||
          entry.source_type === "INVENTORY_DAILY_SUBTOTAL")
    );
    const existingSubtotal = sameDayInventoryEntries.find(
      (entry) => entry.source_type === "INVENTORY_DAILY_SUBTOTAL"
    );

    if (existingSubtotal) {
      combinedInventoryEntries.set(entryDate, {
        ...existingSubtotal,
        title: "Inventory subtotal",
        notes: existingSubtotal.notes || "Auto-updated from same-day inventory additions.",
      });
      continue;
    }

    const latestEntry = sameDayInventoryEntries.reduce((latest, current) =>
      new Date(current.created_at).getTime() > new Date(latest.created_at).getTime() ? current : latest
    );
    combinedInventoryEntries.set(entryDate, {
      ...latestEntry,
      id: `inventory-daily-${entryDate}`,
      title: "Inventory subtotal",
      amount: sameDayInventoryEntries.reduce((sum, entry) => sum + entry.amount, 0),
      notes: "Auto-updated from same-day inventory additions.",
      source_type: "INVENTORY_DAILY_SUBTOTAL",
      source_key: entryDate,
    });
  }

  const seenInventoryDates = new Set<string>();
  const visibleEntries: CashflowEntry[] = [];

  for (const entry of entries) {
    if (
      entry.source_type === "INVENTORY_COST_EVENT" ||
      entry.source_type === "INVENTORY_DAILY_SUBTOTAL"
    ) {
      if (seenInventoryDates.has(entry.entry_date)) continue;
      const combinedEntry = combinedInventoryEntries.get(entry.entry_date);
      if (combinedEntry) visibleEntries.push(combinedEntry);
      seenInventoryDates.add(entry.entry_date);
      continue;
    }

    visibleEntries.push(entry);
  }

  return visibleEntries;
}

function getInventoryEventFormState(event: InventoryCostEvent): InventoryEventFormState {
  return {
    entry_date: event.entry_date,
    occurred_at: event.occurred_at.slice(0, 16),
    qty_added: String(event.qty_added),
    unit_cost: String(event.unit_cost),
    movement_type: event.movement_type,
  };
}

export default function AdminCashflowPage() {
  const { user } = useAuth();
  const monthBounds = React.useMemo(() => getMonthBounds(), []);
  const ledgerRef = React.useRef<HTMLDivElement | null>(null);
  const [entries, setEntries] = React.useState<CashflowEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CashflowFormState>(getInitialFormState);
  const [entryModalOpen, setEntryModalOpen] = React.useState(false);
  const [fromDate, setFromDate] = React.useState(monthBounds.from);
  const [toDate, setToDate] = React.useState(monthBounds.to);
  const [flowFilter, setFlowFilter] = React.useState<"" | CashflowFlowType>("");
  const [categoryFilter, setCategoryFilter] = React.useState<"" | CashflowCategory>("");
  const [selectedEntry, setSelectedEntry] = React.useState<CashflowEntry | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [detailOrders, setDetailOrders] = React.useState<CashflowOrder[]>([]);
  const [detailItems, setDetailItems] = React.useState<CashflowOrderItem[]>([]);
  const [detailInventoryEvents, setDetailInventoryEvents] = React.useState<InventoryCostEvent[]>([]);
  const [detailProducts, setDetailProducts] = React.useState<Record<string, InventoryProduct>>({});
  const [detailVariants, setDetailVariants] = React.useState<Record<string, InventoryVariant>>({});
  const [detailSaving, setDetailSaving] = React.useState(false);
  const [detailDeletingId, setDetailDeletingId] = React.useState<string | null>(null);
  const [editingInventoryEventId, setEditingInventoryEventId] = React.useState<string | null>(null);
  const [inventoryEventForm, setInventoryEventForm] = React.useState<InventoryEventFormState | null>(null);
  const [loans, setLoans] = React.useState<CashLoan[]>([]);
  const [loanLoading, setLoanLoading] = React.useState(true);
  const [loanSaving, setLoanSaving] = React.useState(false);
  const [loanActionId, setLoanActionId] = React.useState<string | null>(null);
  const [loanError, setLoanError] = React.useState<string | null>(null);
  const [loanSuccess, setLoanSuccess] = React.useState<string | null>(null);
  const [loanForm, setLoanForm] = React.useState<CashLoanFormState>(getInitialLoanFormState);
  const [editingLoan, setEditingLoan] = React.useState<CashLoan | null>(null);
  const [loanTabOpen, setLoanTabOpen] = React.useState(false);
  const [quickTab, setQuickTab] = React.useState<"INCOME" | "EXPENSE" | "ALL" | "LOANS">("ALL");
  const isSpayLaterTemplate = React.useMemo(
    () => isSpayLaterLoanTitle(loanForm.title),
    [loanForm.title]
  );

  const visibleCategoryOptions = React.useMemo(() => {
    return CATEGORY_OPTIONS.filter(
      (option) => option.flowType === "BOTH" || option.flowType === form.flow_type
    );
  }, [form.flow_type]);
  const showPaidForMonthField = form.category === "MONTHLY_PAYMENT";

  const loadEntries = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("cashflow_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fromDate) query = query.gte("entry_date", fromDate);
    if (toDate) query = query.lte("entry_date", toDate);
    if (flowFilter) query = query.eq("flow_type", flowFilter);
    if (categoryFilter) query = query.eq("category", categoryFilter);

    const { data, error: queryError } = await query;

    if (queryError) {
      setEntries([]);
      setError(queryError.message || "Failed to load cashflow entries.");
      setLoading(false);
      return;
    }

    setEntries(normalizeCashflowEntries((data as CashflowEntry[] | null) ?? []));
    setLoading(false);
  }, [categoryFilter, flowFilter, fromDate, toDate]);

  const loadLoans = React.useCallback(async () => {
    setLoanLoading(true);
    setLoanError(null);

    const { data, error: queryError } = await supabase
      .from("cash_loans")
      .select("*")
      .order("status", { ascending: true })
      .order("next_due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (queryError) {
      setLoans([]);
      setLoanError(queryError.message || "Failed to load cash loans.");
      setLoanLoading(false);
      return;
    }

    setLoans(
      ((data as CashLoan[] | null) ?? []).map((loan) => ({
        ...loan,
        principal_amount: Number(loan.principal_amount ?? 0),
        term_months: Number(loan.term_months ?? 0),
        monthly_payment: Number(loan.monthly_payment ?? 0),
        payment_day: loan.payment_day == null ? null : Number(loan.payment_day),
        reminder_days_before: Number(loan.reminder_days_before ?? 0),
        months_paid: Number(loan.months_paid ?? 0),
      }))
    );
    setLoanLoading(false);
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  React.useEffect(() => {
    void loadLoans();
  }, [loadLoans]);

  React.useEffect(() => {
    const allowed = visibleCategoryOptions.map((option) => option.value);
    if (!allowed.includes(form.category)) {
      setForm((current) => ({
        ...current,
        category: visibleCategoryOptions[0]?.value ?? "OTHER",
      }));
    }
  }, [form.category, visibleCategoryOptions]);

  React.useEffect(() => {
    if (!isSpayLaterTemplate) return;

    setLoanForm((current) => {
      const normalizedDueMonth = getMonthValueFromDateString(
        /^\d{4}-\d{2}-\d{2}$/.test(current.first_due_date)
          ? current.first_due_date
          : addMonthsToDateString(current.start_date || ymd(new Date()), 1)
      );
      const normalizedDueDate = getDateStringForMonthDay(normalizedDueMonth, 15);
      const next: CashLoanFormState = { ...current };
      let changed = false;

      if (current.lender !== "Shopee") {
        next.lender = "Shopee";
        changed = true;
      }
      if (current.term_months !== "1") {
        next.term_months = "1";
        changed = true;
      }
      if (current.monthly_payment !== current.principal_amount) {
        next.monthly_payment = current.principal_amount;
        changed = true;
      }
      if (current.first_due_date !== normalizedDueDate) {
        next.first_due_date = normalizedDueDate;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [
    isSpayLaterTemplate,
    loanForm.first_due_date,
    loanForm.principal_amount,
    loanForm.start_date,
  ]);

  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    let recurring = 0;
    const byCategory = new Map<string, number>();

    for (const entry of entries) {
      if (entry.flow_type === "INCOME") income += entry.amount;
      if (entry.flow_type === "EXPENSE") expense += entry.amount;
      if (entry.is_recurring) recurring += 1;
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    }

    const categoryBreakdown = Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount,
      }));

    return {
      income,
      expense,
      net: income - expense,
      recurring,
      categoryBreakdown,
    };
  }, [entries]);

  const activeLoans = React.useMemo(
    () => loans.filter((loan) => loan.status === "ACTIVE"),
    [loans]
  );

  const loanReminderItems = React.useMemo(() => {
    return activeLoans
      .map((loan) => {
        const daysUntilDue = getDaysUntilDate(loan.next_due_date);
        const remainingPayments = Math.max(loan.term_months - loan.months_paid, 0);
        return {
          ...loan,
          daysUntilDue,
          remainingPayments,
          remainingScheduled: remainingPayments * loan.monthly_payment,
          dueSoon:
            daysUntilDue != null &&
            daysUntilDue <= loan.reminder_days_before,
        };
      })
      .sort((a, b) => {
        const aDays = a.daysUntilDue ?? 999999;
        const bDays = b.daysUntilDue ?? 999999;
        return aDays - bDays || a.title.localeCompare(b.title);
      });
  }, [activeLoans]);

  const dueLoanCount = React.useMemo(
    () => loanReminderItems.filter((loan) => loan.dueSoon).length,
    [loanReminderItems]
  );

  const nearestIncomingLoan = React.useMemo(() => {
    return loanReminderItems.find(
      (loan) => loan.status === "ACTIVE" && loan.next_due_date && loan.remainingPayments > 0
    ) ?? null;
  }, [loanReminderItems]);

  const detailItemsByOrder = React.useMemo(() => {
    const map = new Map<string, CashflowOrderItem[]>();
    for (const item of detailItems) {
      const current = map.get(item.order_id) ?? [];
      current.push(item);
      map.set(item.order_id, current);
    }
    return map;
  }, [detailItems]);

  const detailOrderMap = React.useMemo(() => {
    return new Map(detailOrders.map((order) => [order.id, order]));
  }, [detailOrders]);

  const detailResolvedItemTotals = React.useMemo(() => {
    const totals = new Map<string, number>();

    for (const [orderId, orderItems] of detailItemsByOrder) {
      const order = detailOrderMap.get(orderId);
      const unresolved: CashflowOrderItem[] = [];
      let resolvedSum = 0;

      for (const item of orderItems) {
        const storedTotal = getStoredOrderItemTotal(item);
        if (storedTotal != null) {
          totals.set(item.id, storedTotal);
          resolvedSum += storedTotal;
        } else {
          unresolved.push(item);
        }
      }

      if (!order || !unresolved.length) continue;

      const remaining = Math.max(Number(order.total || 0) - resolvedSum, 0);
      if (remaining <= 0) continue;

      const totalWeight = unresolved.reduce((sum, item) => sum + Math.max(item.qty, 1), 0);
      let distributed = 0;

      unresolved.forEach((item, index) => {
        const isLast = index === unresolved.length - 1;
        const weight = Math.max(item.qty, 1);
        const nextTotal = isLast
          ? remaining - distributed
          : Number(((remaining * weight) / Math.max(totalWeight, 1)).toFixed(2));

        if (nextTotal > 0) {
          totals.set(item.id, nextTotal);
          distributed += nextTotal;
        }
      });
    }

    return totals;
  }, [detailItemsByOrder, detailOrderMap]);

  const detailItemRollup = React.useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        qty: number;
        sales: number;
        cogs: number;
      }
    >();

    for (const item of detailItems) {
      const name =
        item.item_name?.trim() ||
        item.product_title?.trim() ||
        item.variant_id ||
        item.product_id ||
        "Item";
      const key = `${item.product_id ?? "product"}:${item.variant_id ?? item.id}:${name}`;
      const current = map.get(key) ?? { key, name, qty: 0, sales: 0, cogs: 0 };
      current.qty += item.qty;
      current.sales += Number(detailResolvedItemTotals.get(item.id) ?? 0);
      current.cogs += Number(item.cost_each ?? 0) * item.qty;
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.sales - a.sales);
  }, [detailItems, detailResolvedItemTotals]);

  const entryDetailsDescription = React.useMemo(() => {
    if (!selectedEntry) return "";
    if (selectedEntry.source_type === "SALES_DAILY_SUBTOTAL") {
      return "All matching paid web orders and POS sales for this day, including every sold item.";
    }
    if (
      selectedEntry.source_type === "INVENTORY_COST_EVENT" ||
      selectedEntry.source_type === "INVENTORY_DAILY_SUBTOTAL"
    ) {
      return "Underlying inventory additions that produced this expense entry.";
    }
    return "Full record details for the selected cashflow entry.";
  }, [selectedEntry]);

  const canEditSelectedEntry = React.useMemo(() => {
    if (!selectedEntry) return false;
    return !isAutomaticEntry(selectedEntry);
  }, [selectedEntry]);

  const canDeleteSelectedEntry = React.useMemo(() => {
    if (!selectedEntry) return false;
    return !isAutomaticEntry(selectedEntry);
  }, [selectedEntry]);

  const loadEntryDetails = React.useCallback(async (entry: CashflowEntry) => {
    setDetailsLoading(true);
    setDetailsError(null);
    setDetailOrders([]);
    setDetailItems([]);
    setDetailInventoryEvents([]);
    setDetailProducts({});
    setDetailVariants({});

    try {
      if (entry.source_type === "SALES_DAILY_SUBTOTAL") {
        const { start, end } = getManilaDayRange(entry.entry_date);
        let orderColumns = [...ORDER_DETAIL_COLUMNS];
        let paidRows: CashflowOrder[] = [];
        let posRows: CashflowOrder[] = [];

        while (orderColumns.length) {
          const orderSelect = orderColumns.join(", ");
          const [paidRes, posRes] = await Promise.all([
            supabase
              .from("orders")
              .select(orderSelect)
              .eq("payment_status", "PAID")
              .gte("paid_at", start)
              .lt("paid_at", end)
              .not("status", "in", '("VOIDED","CANCELLED")'),
            supabase
              .from("orders")
              .select(orderSelect)
              .eq("channel", "POS")
              .gte("created_at", start)
              .lt("created_at", end)
              .not("status", "in", '("VOIDED","CANCELLED")'),
          ]);

          if (!paidRes.error && !posRes.error) {
            paidRows = (((paidRes.data as unknown as CashflowOrder[] | null) ?? []).map((row) => ({
              ...row,
              total: Number(row.total ?? 0),
            })));
            posRows = (((posRes.data as unknown as CashflowOrder[] | null) ?? []).map((row) => ({
              ...row,
              total: Number(row.total ?? 0),
            })));
            break;
          }

          const sourceError = paidRes.error ?? posRes.error;
          const missingColumn = getMissingSchemaColumn(sourceError, "orders");
          if (
            !missingColumn ||
            !orderColumns.includes(missingColumn as (typeof ORDER_DETAIL_COLUMNS)[number])
          ) {
            throw sourceError;
          }

          orderColumns = orderColumns.filter((column) => column !== missingColumn);
        }

        const orderMap = new Map<string, CashflowOrder>();
        for (const row of [...paidRows, ...posRows]) {
          orderMap.set(row.id, row);
        }

        const orders = Array.from(orderMap.values()).sort((a, b) => {
          const aTs = new Date(a.paid_at ?? a.created_at).getTime();
          const bTs = new Date(b.paid_at ?? b.created_at).getTime();
          return bTs - aTs;
        });
        setDetailOrders(orders);

        if (orders.length) {
          const orderIds = orders.map((order) => order.id);
          let itemColumns = [...ORDER_ITEM_DETAIL_COLUMNS];
          let itemData: CashflowOrderItem[] | null = null;

          while (itemColumns.length) {
            let itemQuery = supabase
              .from("order_items")
              .select(itemColumns.join(", "))
              .in("order_id", orderIds);

            if (itemColumns.includes("created_at")) {
              itemQuery = itemQuery.order("created_at", { ascending: true });
            }

            const { data, error: itemError } = await itemQuery;

            if (!itemError) {
              itemData = (data as unknown as CashflowOrderItem[] | null) ?? [];
              break;
            }

            const missingColumn = getMissingSchemaColumn(itemError, "order_items");
            if (!missingColumn || !itemColumns.includes(missingColumn as (typeof ORDER_ITEM_DETAIL_COLUMNS)[number])) {
              throw itemError;
            }

            itemColumns = itemColumns.filter((column) => column !== missingColumn);
          }

          setDetailItems(
            ((itemData as CashflowOrderItem[] | null) ?? []).map((item) => ({
              ...item,
              product_id: item.product_id ?? null,
              variant_id: item.variant_id ?? null,
              item_name: item.item_name ?? null,
              product_title: item.product_title ?? null,
              image_url: item.image_url ?? null,
              condition: item.condition ?? null,
              qty: Number(item.qty ?? 0),
              price_each: item.price_each == null ? null : Number(item.price_each),
              unit_price: item.unit_price == null ? null : Number(item.unit_price),
              cost_each: item.cost_each == null ? null : Number(item.cost_each),
              line_total: item.line_total == null ? null : Number(item.line_total),
            }))
          );
        }
        return;
      }

      if (
        entry.source_type === "INVENTORY_COST_EVENT" ||
        entry.source_type === "INVENTORY_DAILY_SUBTOTAL"
      ) {
        let query = supabase
          .from("inventory_cost_events")
          .select("*")
          .order("occurred_at", { ascending: false });

        if (entry.source_type === "INVENTORY_COST_EVENT" && entry.source_key) {
          query = query.eq("id", entry.source_key);
        } else {
          query = query.eq("entry_date", entry.entry_date);
        }

        const { data: eventData, error: eventError } = await query;
        if (eventError) throw eventError;

        const events = ((eventData as InventoryCostEvent[] | null) ?? []).map((event) => ({
          ...event,
          qty_added: Number(event.qty_added ?? 0),
          unit_cost: Number(event.unit_cost ?? 0),
          subtotal: Number(event.subtotal ?? 0),
        }));

        setDetailInventoryEvents(events);

        const productIds = Array.from(new Set(events.map((event) => event.product_id).filter(Boolean)));
        const variantIds = Array.from(new Set(events.map((event) => event.variant_id).filter(Boolean)));

        const [productRes, variantRes] = await Promise.all([
          productIds.length
            ? supabase
                .from("products")
                .select("id, title, brand, model, variation, image_urls")
                .in("id", productIds)
            : Promise.resolve({ data: [], error: null }),
          variantIds.length
            ? supabase
                .from("product_variants")
                .select("id, condition, price, cost")
                .in("id", variantIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (productRes.error) throw productRes.error;
        if (variantRes.error) throw variantRes.error;

        const products = Object.fromEntries(
          (((productRes.data as InventoryProduct[] | null) ?? []).map((product) => [
            product.id,
            product,
          ]))
        );
        const variants = Object.fromEntries(
          (((variantRes.data as InventoryVariant[] | null) ?? []).map((variant) => [
            variant.id,
            {
              ...variant,
              price: variant.price == null ? null : Number(variant.price),
              cost: variant.cost == null ? null : Number(variant.cost),
            },
          ]))
        );

        setDetailProducts(products);
        setDetailVariants(variants);
      }
    } catch (err) {
      setDetailsError(getErrorMessage(err, "Failed to load entry details."));
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const title = form.title.trim();
    const amount = Number(form.amount);
    if (!title) {
      setError("Title is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a valid non-negative number.");
      return;
    }

    setSaving(true);

    const sourceMeta = {
      ...(form.source_meta ?? {}),
    };
    if (form.category === "MONTHLY_PAYMENT" && form.paid_for_month) {
      sourceMeta.paid_for_month = form.paid_for_month;
    } else {
      delete sourceMeta.paid_for_month;
    }

    const normalizedNotes = form.notes.trim();
    const notesValue =
      form.category === "MONTHLY_PAYMENT"
        ? buildMonthlyPaymentNotes(form.entry_date, form.paid_for_month, normalizedNotes)
        : normalizedNotes;

    const payload: Record<string, unknown> = {
      entry_date: form.entry_date,
      flow_type: form.flow_type,
      category: form.category,
      title,
      counterparty: form.counterparty.trim() || null,
      amount,
      notes: notesValue || null,
      is_recurring: form.is_recurring,
      created_by_user_id: form.id ? undefined : user?.id ?? null,
    };
    if (form.id || Object.keys(sourceMeta).length > 0) {
      payload.source_meta = sourceMeta;
    }

    const response = form.id
      ? await supabase.from("cashflow_entries").update(payload).eq("id", form.id)
      : await supabase.from("cashflow_entries").insert(payload);

    if (response.error) {
      setError(response.error.message || "Failed to save cashflow entry.");
      setSaving(false);
      return;
    }

    setForm(getInitialFormState());
    setEntryModalOpen(false);
    setSuccess(form.id ? "Cashflow entry updated." : "Cashflow entry added.");
    setSaving(false);
    await loadEntries();
  }

  function handleEdit(entry: CashflowEntry) {
    setForm({
      id: entry.id,
      entry_date: entry.entry_date,
      flow_type: entry.flow_type,
      category: entry.category,
      title: entry.title,
      counterparty: entry.counterparty ?? "",
      amount: String(entry.amount),
      notes:
        entry.category === "MONTHLY_PAYMENT"
          ? stripMonthlyPaymentNotes(entry.notes)
          : entry.notes ?? "",
      is_recurring: Boolean(entry.is_recurring),
      paid_for_month: getPaidForMonth(entry),
      source_meta: entry.source_meta ?? null,
    });
    setSuccess(null);
    setError(null);
    setEntryModalOpen(true);
  }

  function handleCancelEdit() {
    setForm(getInitialFormState());
    setError(null);
    setSuccess(null);
    setEntryModalOpen(false);
  }

  function applySummaryFilter(next: "INCOME" | "EXPENSE" | "ALL") {
    setLoanTabOpen(false);
    setQuickTab(next);
    setFlowFilter(next === "ALL" ? "" : next);
    window.setTimeout(() => {
      ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function applyCategoryBreakdownFilter(category: CashflowCategory) {
    setLoanTabOpen(false);
    setQuickTab("ALL");
    setFlowFilter("");
    setCategoryFilter(category);
    window.setTimeout(() => {
      ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function openLoanSetupTab() {
    setQuickTab("LOANS");
    setLoanTabOpen(true);
  }

  function closeLoanSetupTab() {
    setLoanTabOpen(false);
    setQuickTab(
      flowFilter === "INCOME" || flowFilter === "EXPENSE"
        ? flowFilter
        : "ALL"
    );
  }

  function resetLoanForm() {
    setLoanForm(getInitialLoanFormState());
    setEditingLoan(null);
    setLoanError(null);
    setLoanSuccess(null);
  }

  function handleStartLoanEdit(loan: CashLoan) {
    setEditingLoan(loan);
    setLoanForm(getLoanFormStateFromLoan(loan));
    setLoanError(null);
    setLoanSuccess(null);
  }

  function handleOpenEntry(entry: CashflowEntry) {
    setSelectedEntry(entry);
    setDetailsOpen(true);
    setDetailsError(null);
    setEditingInventoryEventId(null);
    setInventoryEventForm(null);
    void loadEntryDetails(entry);
  }

  async function handleDelete(id: string) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this cashflow entry?");
      if (!confirmed) return;
    }

    setDeletingId(id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await supabase.from("cashflow_entries").delete().eq("id", id);

    if (deleteError) {
      setError(deleteError.message || "Failed to delete cashflow entry.");
      setDeletingId(null);
      return;
    }

    if (form.id === id) {
      setForm(getInitialFormState());
      setEntryModalOpen(false);
    }
    setSuccess("Cashflow entry deleted.");
    setDeletingId(null);
    await loadEntries();
  }

  async function handleDeleteFromDetails(entry: CashflowEntry) {
    await handleDelete(entry.id);
    setDetailsOpen(false);
    setSelectedEntry(null);
  }

  function handleStartInventoryEventEdit(event: InventoryCostEvent) {
    setEditingInventoryEventId(event.id);
    setInventoryEventForm(getInventoryEventFormState(event));
    setDetailsError(null);
    setSuccess(null);
  }

  function handleCancelInventoryEventEdit() {
    setEditingInventoryEventId(null);
    setInventoryEventForm(null);
    setDetailsError(null);
  }

  async function handleSaveInventoryEvent(event: InventoryCostEvent) {
    if (!inventoryEventForm) return;

    const qtyAdded = Number(inventoryEventForm.qty_added);
    const unitCost = Number(inventoryEventForm.unit_cost);
    const occurredAt = inventoryEventForm.occurred_at
      ? new Date(inventoryEventForm.occurred_at).toISOString()
      : "";

    if (!inventoryEventForm.entry_date) {
      setDetailsError("Entry date is required.");
      return;
    }
    if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
      setDetailsError("Occurred time must be valid.");
      return;
    }
    if (!Number.isFinite(qtyAdded) || qtyAdded <= 0) {
      setDetailsError("Quantity added must be greater than zero.");
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setDetailsError("Unit cost must be a valid non-negative number.");
      return;
    }

    const subtotal = qtyAdded * unitCost;
    const sourceMeta = {
      inventory_cost_event_id: event.id,
      variant_id: event.variant_id,
      product_id: event.product_id,
      qty_added: qtyAdded,
      unit_cost: unitCost,
      movement_type: inventoryEventForm.movement_type,
      timezone: "Asia/Manila",
      ...(event.meta ?? {}),
    };

    setDetailSaving(true);
    setDetailsError(null);
    setSuccess(null);

    const updatePayload = {
      entry_date: inventoryEventForm.entry_date,
      occurred_at: occurredAt,
      qty_added: qtyAdded,
      unit_cost: unitCost,
      subtotal,
      movement_type: inventoryEventForm.movement_type,
    };

    const [{ error: eventError }, { error: cashflowError }] = await Promise.all([
      supabase.from("inventory_cost_events").update(updatePayload).eq("id", event.id),
      supabase
        .from("cashflow_entries")
        .update({
          entry_date: inventoryEventForm.entry_date,
          amount: subtotal,
          category: "INVENTORY_COST",
          flow_type: "EXPENSE",
          title: "Inventory add",
          notes: "Auto-generated from an inventory upload/add event.",
          source_meta: sourceMeta,
        })
        .eq("source_type", "INVENTORY_COST_EVENT")
        .eq("source_key", event.id),
    ]);

    if (eventError || cashflowError) {
      setDetailsError(
        eventError?.message || cashflowError?.message || "Failed to update inventory detail."
      );
      setDetailSaving(false);
      return;
    }

    setDetailSaving(false);
    setEditingInventoryEventId(null);
    setInventoryEventForm(null);
    setSuccess("Inventory detail updated.");
    await loadEntries();
    if (selectedEntry) {
      await loadEntryDetails(selectedEntry);
    }
  }

  async function handleDeleteInventoryEvent(event: InventoryCostEvent) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this inventory detail and its linked cashflow row?");
      if (!confirmed) return;
    }

    setDetailDeletingId(event.id);
    setDetailsError(null);
    setSuccess(null);

    const [{ error: cashflowError }, { error: eventError }] = await Promise.all([
      supabase
        .from("cashflow_entries")
        .delete()
        .eq("source_type", "INVENTORY_COST_EVENT")
        .eq("source_key", event.id),
      supabase.from("inventory_cost_events").delete().eq("id", event.id),
    ]);

    if (cashflowError || eventError) {
      setDetailsError(
        cashflowError?.message || eventError?.message || "Failed to delete inventory detail."
      );
      setDetailDeletingId(null);
      return;
    }

    setDetailDeletingId(null);
    setEditingInventoryEventId((current) => (current === event.id ? null : current));
    setInventoryEventForm(null);
    setSuccess("Inventory detail deleted.");
    await loadEntries();

    if (selectedEntry?.source_type === "INVENTORY_COST_EVENT" && selectedEntry.source_key === event.id) {
      setDetailsOpen(false);
      setSelectedEntry(null);
      return;
    }

    if (selectedEntry) {
      await loadEntryDetails(selectedEntry);
    }
  }

  async function handleCreateLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoanError(null);
    setLoanSuccess(null);

    const title = loanForm.title.trim();
    const principalAmount = Number(loanForm.principal_amount);
    const termMonths = Number(loanForm.term_months);
    const monthlyPayment = Number(loanForm.monthly_payment);
    const reminderDaysBefore = Number(loanForm.reminder_days_before);

    if (!title) {
      setLoanError("Loan title is required.");
      return;
    }
    if (!loanForm.start_date || !loanForm.first_due_date) {
      setLoanError("Start date and first due date are required.");
      return;
    }
    if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
      setLoanError("Loan amount must be greater than zero.");
      return;
    }
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      setLoanError("Term months must be greater than zero.");
      return;
    }
    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      setLoanError("Monthly payment must be greater than zero.");
      return;
    }
    if (!Number.isFinite(reminderDaysBefore) || reminderDaysBefore < 0) {
      setLoanError("Reminder lead time must be zero or greater.");
      return;
    }

    setLoanSaving(true);

    if (editingLoan) {
      if (termMonths < editingLoan.months_paid) {
        setLoanError("Term months cannot be less than the number of payments already logged.");
        setLoanSaving(false);
        return;
      }

      const recalculatedNextDueDate =
        editingLoan.months_paid >= termMonths
          ? null
          : addMonthsToDateString(loanForm.first_due_date, editingLoan.months_paid);
      const nextStatus =
        editingLoan.status === "CANCELLED"
          ? "CANCELLED"
          : editingLoan.months_paid >= termMonths
            ? "PAID"
            : "ACTIVE";

      const loanUpdatePayload = {
        title,
        lender: loanForm.lender.trim() || null,
        principal_amount: principalAmount,
        term_months: termMonths,
        monthly_payment: monthlyPayment,
        start_date: loanForm.start_date,
        first_due_date: loanForm.first_due_date,
        next_due_date: recalculatedNextDueDate,
        payment_day: parseDateValue(loanForm.first_due_date).getDate(),
        reminder_days_before: reminderDaysBefore,
        status: nextStatus,
        notes: loanForm.notes.trim() || null,
      };

      const cashflowUpdatePayload = {
        entry_date: loanForm.start_date,
        title,
        counterparty: loanForm.lender.trim() || null,
        amount: principalAmount,
        notes:
          loanForm.notes.trim() ||
          `Cash loan scheduled for ${termMonths} months at ${peso(monthlyPayment)} per month.`,
        source_meta: {
          loan_id: editingLoan.id,
          term_months: termMonths,
          monthly_payment: monthlyPayment,
          first_due_date: loanForm.first_due_date,
          reminder_days_before: reminderDaysBefore,
        },
      };

      const [{ error: loanUpdateError }, { error: cashflowUpdateError }] = await Promise.all([
        supabase.from("cash_loans").update(loanUpdatePayload).eq("id", editingLoan.id),
        supabase
          .from("cashflow_entries")
          .update(cashflowUpdatePayload)
          .eq("source_type", "CASH_LOAN")
          .eq("source_key", editingLoan.id),
      ]);

      if (loanUpdateError || cashflowUpdateError) {
        setLoanError(
          loanUpdateError?.message ||
            cashflowUpdateError?.message ||
            "Failed to update cash loan."
        );
        setLoanSaving(false);
        return;
      }

      setLoanSaving(false);
      resetLoanForm();
      setLoanSuccess("Cash loan updated.");
      await Promise.all([loadLoans(), loadEntries()]);
      return;
    }

    const loanPayload = {
      title,
      lender: loanForm.lender.trim() || null,
      principal_amount: principalAmount,
      term_months: termMonths,
      monthly_payment: monthlyPayment,
      start_date: loanForm.start_date,
      first_due_date: loanForm.first_due_date,
      next_due_date: loanForm.first_due_date,
      payment_day: parseDateValue(loanForm.first_due_date).getDate(),
      reminder_days_before: reminderDaysBefore,
      months_paid: 0,
      status: "ACTIVE" as const,
      notes: loanForm.notes.trim() || null,
      created_by_user_id: user?.id ?? null,
    };

    const { data: loanData, error: loanInsertError } = await supabase
      .from("cash_loans")
      .insert(loanPayload)
      .select("*")
      .single();

    if (loanInsertError || !loanData) {
      setLoanError(loanInsertError?.message || "Failed to create cash loan.");
      setLoanSaving(false);
      return;
    }

    const cashflowPayload = {
      entry_date: loanForm.start_date,
      flow_type: "INCOME" as const,
      category: "LOAN" as const,
      title,
      counterparty: loanForm.lender.trim() || null,
      amount: principalAmount,
      notes:
        loanForm.notes.trim() ||
        `Cash loan scheduled for ${termMonths} months at ${peso(monthlyPayment)} per month.`,
      is_recurring: false,
      source_type: "CASH_LOAN",
      source_key: loanData.id,
      source_meta: {
        loan_id: loanData.id,
        term_months: termMonths,
        monthly_payment: monthlyPayment,
        first_due_date: loanForm.first_due_date,
        reminder_days_before: reminderDaysBefore,
      },
      created_by_user_id: user?.id ?? null,
    };

    const { error: cashflowInsertError } = await supabase
      .from("cashflow_entries")
      .insert(cashflowPayload);

    if (cashflowInsertError) {
      await supabase.from("cash_loans").delete().eq("id", loanData.id);
      setLoanError(cashflowInsertError.message || "Failed to create the linked loan entry.");
      setLoanSaving(false);
      return;
    }

    setLoanSaving(false);
    resetLoanForm();
    setLoanSuccess("Cash loan added. The reminder is now tracked from the first due date.");
    await Promise.all([loadLoans(), loadEntries()]);
  }

  async function handleLogLoanPayment(loan: CashLoan) {
    const remainingPayments = Math.max(loan.term_months - loan.months_paid, 0);
    if (remainingPayments <= 0) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Log payment ${loan.months_paid + 1}/${loan.term_months} for ${loan.title}?`
      );
      if (!confirmed) return;
    }

    setLoanActionId(loan.id);
    setLoanError(null);
    setLoanSuccess(null);

    const paymentIndex = loan.months_paid + 1;
    const nextPaymentCount = paymentIndex >= loan.term_months ? loan.term_months : paymentIndex;
    const nextDueDate =
      paymentIndex >= loan.term_months || !loan.next_due_date
        ? null
        : addMonthsToDateString(loan.next_due_date, 1);

    const cashflowPayload = {
      entry_date: ymd(new Date()),
      flow_type: "EXPENSE" as const,
      category: "MONTHLY_PAYMENT" as const,
      title: `${loan.title} payment ${paymentIndex}/${loan.term_months}`,
      counterparty: loan.lender,
      amount: loan.monthly_payment,
      notes: loan.next_due_date
        ? `Logged against due date ${formatDate(loan.next_due_date)}.`
        : "Logged from loan reminder tracker.",
      is_recurring: true,
      source_type: "CASH_LOAN_PAYMENT",
      source_key: `${loan.id}:${paymentIndex}`,
      source_meta: {
        loan_id: loan.id,
        payment_number: paymentIndex,
        term_months: loan.term_months,
        next_due_date: nextDueDate,
      },
      created_by_user_id: user?.id ?? null,
    };

    const { error: cashflowInsertError } = await supabase
      .from("cashflow_entries")
      .insert(cashflowPayload);

    if (cashflowInsertError) {
      setLoanError(cashflowInsertError.message || "Failed to log the loan payment.");
      setLoanActionId(null);
      return;
    }

    const { error: loanUpdateError } = await supabase
      .from("cash_loans")
      .update({
        months_paid: nextPaymentCount,
        next_due_date: nextDueDate,
        status: paymentIndex >= loan.term_months ? "PAID" : "ACTIVE",
      })
      .eq("id", loan.id);

    if (loanUpdateError) {
      setLoanError(loanUpdateError.message || "Payment was logged but the reminder could not update.");
      setLoanActionId(null);
      await loadEntries();
      return;
    }

    setLoanActionId(null);
    setLoanSuccess(
      paymentIndex >= loan.term_months
        ? `${loan.title} is now marked as fully paid.`
        : `${loan.title} payment logged. Next reminder moved forward.`
    );
    await Promise.all([loadLoans(), loadEntries()]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-300/80">
              Admin Finance
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
              Cashflow
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/64">
              Track incoming and outgoing cash across loans, monthly payments, allowances,
              bills, event materials, shipping materials, and inventory buying. Inventory
              adds now create expense entries automatically, and sales income still rolls
              up by day.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{entries.length} filtered entries</Badge>
            <Badge>{totals.recurring} recurring tagged</Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody
            className={`space-y-2 transition ${quickTab === "INCOME" ? "ring-1 ring-emerald-400/40" : ""}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => applySummaryFilter("INCOME")}
            >
            <div className="flex items-center gap-2 text-sm text-white/56">
              <Coins className="h-4 w-4 text-emerald-300" />
              Income
            </div>
            <div className="text-2xl font-semibold text-emerald-300">{peso(totals.income)}</div>
            </button>
          </CardBody>
        </Card>
        <Card>
          <CardBody
            className={`space-y-2 transition ${quickTab === "EXPENSE" ? "ring-1 ring-red-400/40" : ""}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => applySummaryFilter("EXPENSE")}
            >
            <div className="flex items-center gap-2 text-sm text-white/56">
              <Wallet className="h-4 w-4 text-red-300" />
              Expenses
            </div>
            <div className="text-2xl font-semibold text-red-300">{peso(totals.expense)}</div>
            </button>
          </CardBody>
        </Card>
        <Card>
          <CardBody
            className={`space-y-2 transition ${quickTab === "ALL" ? "ring-1 ring-accent-300/35" : ""}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => applySummaryFilter("ALL")}
            >
            <div className="flex items-center gap-2 text-sm text-white/56">
              <CalendarRange className="h-4 w-4 text-accent-300" />
              Net Cashflow
            </div>
            <div
              className={`text-2xl font-semibold ${
                totals.net >= 0 ? "text-accent-200" : "text-amber-200"
              }`}
            >
              {peso(totals.net)}
            </div>
            </button>
          </CardBody>
        </Card>
        <Card>
          <CardBody
            className={`space-y-2 transition ${quickTab === "LOANS" ? "ring-1 ring-amber-300/35" : ""}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={openLoanSetupTab}
            >
              <div className="flex items-center justify-between gap-3 text-sm text-white/56">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-amber-300" />
                  Cash Loan Setup
                </div>
                <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                  {activeLoans.length}
                </div>
              </div>
              {nearestIncomingLoan ? (
                <div className="mt-3 text-sm text-white/72">
                  {(nearestIncomingLoan.lender ?? nearestIncomingLoan.title) || "Loan"} •{" "}
                  {peso(nearestIncomingLoan.monthly_payment)} •{" "}
                  {formatDate(nearestIncomingLoan.next_due_date!)}
                </div>
              ) : null}
              <div className="mt-2 text-xs text-white/45">
                {dueLoanCount > 0
                  ? `${dueLoanCount} payment reminder${dueLoanCount === 1 ? "" : "s"} due soon`
                  : "No payment reminders due soon"}
              </div>
            </button>
          </CardBody>
        </Card>
      </div>

      {false ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Cash loan setup</div>
              <div className="mt-1 text-sm text-white/56">
                Save the loan amount, monthly payment, term, and first due date in one place.
                The borrowed amount is also added to the ledger automatically.
              </div>
            </div>
            <Badge>{activeLoans.length} active</Badge>
          </CardHeader>
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreateLoan}>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Loan Title"
                  placeholder="Example: BPI cash loan"
                  value={loanForm.title}
                  onChange={(event) =>
                    setLoanForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
                <Input
                  label="Lender"
                  placeholder="Bank, person, or lending app"
                  value={loanForm.lender}
                  onChange={(event) =>
                    setLoanForm((current) => ({ ...current, lender: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  label="Loan Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={loanForm.principal_amount}
                  onChange={(event) =>
                    setLoanForm((current) => ({
                      ...current,
                      principal_amount: event.target.value,
                    }))
                  }
                  required
                />
                <Input
                  label="Term (Months)"
                  type="number"
                  min="1"
                  step="1"
                  value={loanForm.term_months}
                  onChange={(event) =>
                    setLoanForm((current) => ({ ...current, term_months: event.target.value }))
                  }
                  required
                />
                <Input
                  label="Monthly Payment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={loanForm.monthly_payment}
                  onChange={(event) =>
                    setLoanForm((current) => ({
                      ...current,
                      monthly_payment: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  label="Loan Start Date"
                  type="date"
                  value={loanForm.start_date}
                  onChange={(event) =>
                    setLoanForm((current) => ({ ...current, start_date: event.target.value }))
                  }
                  required
                />
                <Input
                  label="First Due Date"
                  type="date"
                  value={loanForm.first_due_date}
                  onChange={(event) =>
                    setLoanForm((current) => ({
                      ...current,
                      first_due_date: event.target.value,
                    }))
                  }
                  required
                />
                <Input
                  label="Remind Me Before"
                  type="number"
                  min="0"
                  step="1"
                  value={loanForm.reminder_days_before}
                  onChange={(event) =>
                    setLoanForm((current) => ({
                      ...current,
                      reminder_days_before: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <Textarea
                label="Notes"
                placeholder="Optional account details, reference number, or special terms"
                value={loanForm.notes}
                onChange={(event) =>
                  setLoanForm((current) => ({ ...current, notes: event.target.value }))
                }
              />

              {loanError ? <div className="text-sm text-red-400">{loanError}</div> : null}
              {loanSuccess ? <div className="text-sm text-emerald-300">{loanSuccess}</div> : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={loanSaving}>
                  <Landmark className="h-4 w-4" />
                  {loanSaving ? "Saving..." : "Add Loan Tracker"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setLoanForm(getInitialLoanFormState());
                    setLoanError(null);
                    setLoanSuccess(null);
                  }}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Loan reminders</div>
              <div className="mt-1 text-sm text-white/56">
                See what needs payment next and log a month instantly when you pay it.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{dueLoanCount} due soon</Badge>
              <Badge>{activeLoans.length} tracked</Badge>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {loanLoading ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
                Loading loan reminders...
              </div>
            ) : loanReminderItems.length ? (
              loanReminderItems.map((loan) => {
                const dueState =
                  loan.daysUntilDue == null
                    ? "No due date"
                    : loan.daysUntilDue < 0
                      ? `Overdue by ${Math.abs(loan.daysUntilDue)} day${Math.abs(loan.daysUntilDue) === 1 ? "" : "s"}`
                      : loan.daysUntilDue === 0
                        ? "Due today"
                        : `Due in ${loan.daysUntilDue} day${loan.daysUntilDue === 1 ? "" : "s"}`;
                const badgeClass =
                  loan.daysUntilDue != null && loan.daysUntilDue < 0
                    ? "border-red-400/20 bg-red-400/10 text-red-200"
                    : loan.dueSoon
                      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                      : "border-white/10 bg-white/[0.03] text-white/70";

                return (
                  <div
                    key={loan.id}
                    className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={badgeClass}>{dueState}</Badge>
                          <Badge>{loan.months_paid}/{loan.term_months} paid</Badge>
                        </div>
                        <div className="font-medium text-white">{loan.title}</div>
                        <div className="text-xs text-white/50">
                          {loan.lender || "Unknown lender"} • Started {formatDate(loan.start_date)} •
                          Next due {loan.next_due_date ? ` ${formatDate(loan.next_due_date)}` : " complete"}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="flex items-center gap-2 text-sm font-medium text-white sm:justify-end">
                          <BellRing className="h-4 w-4 text-amber-300" />
                          {peso(loan.monthly_payment)}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          Remaining {loan.remainingPayments} month{loan.remainingPayments === 1 ? "" : "s"} •
                          {` ${peso(loan.remainingScheduled)}`}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={loanActionId === loan.id || loan.remainingPayments <= 0}
                        onClick={() => void handleLogLoanPayment(loan)}
                      >
                        <Wallet className="h-4 w-4" />
                        {loanActionId === loan.id ? "Logging..." : "Log Monthly Payment"}
                      </Button>
                    </div>
                    {loan.notes ? <div className="mt-3 text-sm text-white/62">{loan.notes}</div> : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
                No active cash loans yet. Add one on the left and reminders will show here.
              </div>
            )}
          </CardBody>
        </Card>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Add cashflow entry</div>
              <div className="mt-1 text-sm text-white/56">
                Use one ledger for operating costs, inflows, and financing records.
                Inventory add expenses and sales subtotal entries are generated automatically.
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setForm(getInitialFormState());
                setError(null);
                setSuccess(null);
              }}
            >
              Reset
            </Button>
          </CardHeader>
          <CardBody>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={showPaidForMonthField ? "Paid On" : "Entry Date"}
                  type="date"
                  hint={
                    showPaidForMonthField
                      ? "This date decides which month the payment appears under in the ledger."
                      : undefined
                  }
                  value={form.entry_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, entry_date: event.target.value }))
                  }
                  required
                />
                <Select
                  label="Flow Type"
                  value={form.flow_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      flow_type: event.target.value as CashflowFlowType,
                    }))
                  }
                >
                  {FLOW_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <Select
                  label="Category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value as CashflowCategory,
                    }))
                  }
                >
                  {visibleCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Title"
                  placeholder="Example: May warehouse rent"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
                <Input
                  label="Counterparty"
                  placeholder="Payee, lender, supplier, or source"
                  value={form.counterparty}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, counterparty: event.target.value }))
                  }
                />
              </div>

              {showPaidForMonthField ? (
                <Input
                  label="Paid For Month"
                  type="month"
                  value={form.paid_for_month}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paid_for_month: event.target.value,
                    }))
                  }
                />
              ) : null}

              <Textarea
                label="Notes"
                placeholder={
                  showPaidForMonthField
                    ? "Optional extra details for this payment"
                    : "Optional details, due dates, references, or event notes"
                }
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/78">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                  checked={form.is_recurring}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_recurring: event.target.checked,
                    }))
                  }
                />
                Mark as recurring
              </label>

              {error ? <div className="text-sm text-red-400">{error}</div> : null}
              {success ? <div className="text-sm text-emerald-300">{success}</div> : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving}>
                  <Plus className="h-4 w-4" />
                  {saving ? "Saving..." : "Add Entry"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFromDate(monthBounds.from);
                    setToDate(monthBounds.to);
                    setFlowFilter("");
                    setCategoryFilter("");
                    setForm(getInitialFormState());
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Current Month
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="text-lg font-semibold text-white">Filters</div>
              <div className="mt-1 text-sm text-white/56">
                Narrow the ledger to a month, category, or only income versus expenses.
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="From"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <Input
                  label="To"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Flow Type"
                  value={flowFilter}
                  onChange={(event) => setFlowFilter(event.target.value as "" | CashflowFlowType)}
                >
                  <option value="">All types</option>
                  {FLOW_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Category"
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as "" | CashflowCategory)
                  }
                >
                  <option value="">All categories</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="primary" onClick={() => void loadEntries()}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setFlowFilter("");
                    setCategoryFilter("");
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-lg font-semibold text-white">Category breakdown</div>
              <div className="mt-1 text-sm text-white/56">
                Highest-value buckets inside the current filtered date range.
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {totals.categoryBreakdown.length ? (
                totals.categoryBreakdown.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    key={item.category}
                    onClick={() => applyCategoryBreakdownFilter(item.category as CashflowCategory)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      categoryFilter === item.category
                        ? "border-accent-300/35 bg-accent-300/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="text-sm text-white/74">{categoryLabel(item.category as CashflowCategory)}</div>
                    <div className="font-medium text-white">{peso(item.amount)}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                  No entries in the selected window yet.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ModalShell
        open={entryModalOpen}
        onClose={handleCancelEdit}
        width="xl"
        title="Edit Ledger Entry"
        description="Update the manual cashflow entry in a pop-up instead of editing inline."
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={showPaidForMonthField ? "Paid On" : "Entry Date"}
              type="date"
              hint={
                showPaidForMonthField
                  ? "This date decides which month the payment appears under in the ledger."
                  : undefined
              }
              value={form.entry_date}
              onChange={(event) =>
                setForm((current) => ({ ...current, entry_date: event.target.value }))
              }
              required
            />
            <Select
              label="Flow Type"
              value={form.flow_type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  flow_type: event.target.value as CashflowFlowType,
                }))
              }
            >
              {FLOW_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <Select
              label="Category"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as CashflowCategory,
                }))
              }
            >
              {visibleCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({ ...current, amount: event.target.value }))
              }
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              placeholder="Example: May warehouse rent"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
            <Input
              label="Counterparty"
              placeholder="Payee, lender, supplier, or source"
              value={form.counterparty}
              onChange={(event) =>
                setForm((current) => ({ ...current, counterparty: event.target.value }))
              }
            />
          </div>

          {showPaidForMonthField ? (
            <Input
              label="Paid For Month"
              type="month"
              hint="Use this to mark which billing month this payment was for."
              value={form.paid_for_month}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  paid_for_month: event.target.value,
                }))
              }
            />
          ) : null}

          <Textarea
            label="Notes"
            placeholder={
              showPaidForMonthField
                ? "Optional extra details for this payment"
                : "Optional details, due dates, references, or event notes"
            }
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
          />

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/78">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-transparent"
              checked={form.is_recurring}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  is_recurring: event.target.checked,
                }))
              }
            />
            Mark as recurring
          </label>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}
          {success ? <div className="text-sm text-emerald-300">{success}</div> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              <Pencil className="h-4 w-4" />
              {saving ? "Saving..." : "Update Entry"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleCancelEdit}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalShell>

      <div ref={ledgerRef}>
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">Ledger entries</div>
            <div className="mt-1 text-sm text-white/56">
              Click any record to inspect its source items. Manual lines can still be edited here.
            </div>
          </div>
          {loading ? <Badge>Loading</Badge> : null}
        </CardHeader>
        <CardBody className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
              Loading cashflow entries...
            </div>
          ) : entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="block w-full cursor-pointer text-left"
                  onClick={() => handleOpenEntry(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenEntry(entry);
                    }
                  }}
                >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          entry.flow_type === "INCOME"
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                            : "border-red-400/20 bg-red-400/10 text-red-200"
                        }
                      >
                        {entry.flow_type}
                      </Badge>
                      <Badge>{categoryLabel(entry.category)}</Badge>
                      {isAutomaticEntry(entry) ? <Badge>Automatic</Badge> : null}
                      {entry.is_recurring ? <Badge>Recurring</Badge> : null}
                    </div>
                    <div className="text-lg font-semibold text-white">{entry.title}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/60">
                      <span>{formatDate(entry.entry_date)}</span>
                      {entry.counterparty ? <span>{entry.counterparty}</span> : null}
                    </div>
                    {entry.notes ? <div className="text-sm text-white/62">{entry.notes}</div> : null}
                  </div>

                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <div className="flex items-center gap-3">
                      <div
                        className={`text-xl font-semibold ${
                          entry.flow_type === "INCOME" ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {entry.flow_type === "INCOME" ? "+" : "-"}
                        {peso(entry.amount)}
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/35" />
                    </div>
                    {isAutomaticEntry(entry) ? (
                      <div className="text-xs text-white/45">
                        {entry.source_type === "SALES_DAILY_SUBTOTAL"
                          ? "Auto-updated from same-day sales."
                          : entry.source_type === "INVENTORY_COST_EVENT"
                            ? "Auto-created from an inventory upload/add event."
                            : "Auto-updated from same-day inventory additions."}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleEdit(entry)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={deletingId === entry.id}
                          onClick={() => void handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === entry.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
              No cashflow entries match the current filters.
            </div>
          )}
        </CardBody>
      </Card>
      </div>

      <ModalShell
        open={loanTabOpen}
        onClose={closeLoanSetupTab}
        width="2xl"
        title="Cash Loan Setup"
        description="Add a loan, track due dates, and log monthly payments without leaving cashflow."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">
                  {editingLoan ? "Edit cash loan" : "Cash loan setup"}
                </div>
                <div className="mt-1 text-sm text-white/56">
                  {editingLoan
                    ? "Update the loan details and keep the linked tracker in sync."
                    : "Save the loan amount, monthly payment, term, and first due date in one place. The borrowed amount is also added to the ledger automatically."}
                </div>
              </div>
              <Badge>{activeLoans.length} active</Badge>
            </CardHeader>
            <CardBody>
              <form className="space-y-4" onSubmit={handleCreateLoan}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Loan Title"
                    placeholder="Example: BPI cash loan or SpayLater - Jun 2026"
                    list="loan-title-suggestions"
                    hint="Typing or selecting SpayLater will activate the Shopee preset."
                    value={loanForm.title}
                    onChange={(event) =>
                      setLoanForm((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                  />
                  <datalist id="loan-title-suggestions">
                    <option value="SpayLater" />
                    <option value="SpayLater - Jun 2026" />
                    <option value="SpayLater - Jul 2026" />
                    <option value="SpayLater - Aug 2026" />
                  </datalist>
                  <Input
                    label="Lender"
                    placeholder="Bank, person, or lending app"
                    value={loanForm.lender}
                    disabled={isSpayLaterTemplate}
                    onChange={(event) =>
                      setLoanForm((current) => ({ ...current, lender: event.target.value }))
                    }
                  />
                </div>

                {isSpayLaterTemplate ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    SpayLater preset active: lender is set to Shopee, term is fixed to 1 month,
                    monthly payment follows the loan amount, and the due date is always the 15th.
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <Input
                    label="Loan Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanForm.principal_amount}
                    onChange={(event) =>
                      setLoanForm((current) => ({
                        ...current,
                        principal_amount: event.target.value,
                        monthly_payment: isSpayLaterTemplate
                          ? event.target.value
                          : current.monthly_payment,
                      }))
                    }
                    required
                  />
                  <Input
                    label="Term (Months)"
                    type="number"
                    min="1"
                    step="1"
                    value={loanForm.term_months}
                    disabled={isSpayLaterTemplate}
                    onChange={(event) =>
                      setLoanForm((current) => ({ ...current, term_months: event.target.value }))
                    }
                    required
                  />
                  <Input
                    label="Monthly Payment"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanForm.monthly_payment}
                    disabled={isSpayLaterTemplate}
                    onChange={(event) =>
                      setLoanForm((current) => ({
                        ...current,
                        monthly_payment: event.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Input
                    label="Loan Start Date"
                    type="date"
                    value={loanForm.start_date}
                    onChange={(event) =>
                      setLoanForm((current) => {
                        const nextStartDate = event.target.value;
                        if (!isSpayLaterTemplate) {
                          return { ...current, start_date: nextStartDate };
                        }
                        const dueMonth = getMonthValueFromDateString(
                          addMonthsToDateString(nextStartDate, 1)
                        );
                        return {
                          ...current,
                          start_date: nextStartDate,
                          first_due_date: getDateStringForMonthDay(dueMonth, 15),
                        };
                      })
                    }
                    required
                  />
                  {isSpayLaterTemplate ? (
                    <Input
                      label="Due Month"
                      type="month"
                      value={getMonthValueFromDateString(loanForm.first_due_date)}
                      onChange={(event) =>
                        setLoanForm((current) => ({
                          ...current,
                          first_due_date: getDateStringForMonthDay(event.target.value, 15),
                        }))
                      }
                      required
                    />
                  ) : (
                    <Input
                      label="First Due Date"
                      type="date"
                      value={loanForm.first_due_date}
                      onChange={(event) =>
                        setLoanForm((current) => ({
                          ...current,
                          first_due_date: event.target.value,
                        }))
                      }
                      required
                    />
                  )}
                  <Input
                    label="Remind Me Before"
                    type="number"
                    min="0"
                    step="1"
                    value={loanForm.reminder_days_before}
                    onChange={(event) =>
                      setLoanForm((current) => ({
                        ...current,
                        reminder_days_before: event.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <Textarea
                  label="Notes"
                  placeholder="Optional account details, reference number, or special terms"
                  value={loanForm.notes}
                  onChange={(event) =>
                    setLoanForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />

                {loanError ? <div className="text-sm text-red-400">{loanError}</div> : null}
                {loanSuccess ? <div className="text-sm text-emerald-300">{loanSuccess}</div> : null}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={loanSaving}>
                    <Landmark className="h-4 w-4" />
                    {loanSaving
                      ? "Saving..."
                      : editingLoan
                        ? "Save Loan Changes"
                        : "Add Loan Tracker"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetLoanForm}
                  >
                    {editingLoan ? "Cancel Edit" : "Reset"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Loan reminders</div>
                <div className="mt-1 text-sm text-white/56">
                  See what needs payment next and log a month instantly when you pay it.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{dueLoanCount} due soon</Badge>
                <Badge>{activeLoans.length} tracked</Badge>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {loanLoading ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
                  Loading loan reminders...
                </div>
              ) : loanReminderItems.length ? (
                loanReminderItems.map((loan) => {
                  const dueState =
                    loan.daysUntilDue == null
                      ? "No due date"
                      : loan.daysUntilDue < 0
                        ? `Overdue by ${Math.abs(loan.daysUntilDue)} day${Math.abs(loan.daysUntilDue) === 1 ? "" : "s"}`
                        : loan.daysUntilDue === 0
                          ? "Due today"
                          : `Due in ${loan.daysUntilDue} day${loan.daysUntilDue === 1 ? "" : "s"}`;
                  const badgeClass =
                    loan.daysUntilDue != null && loan.daysUntilDue < 0
                      ? "border-red-400/20 bg-red-400/10 text-red-200"
                      : loan.dueSoon
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-white/70";

                  return (
                    <div
                      key={loan.id}
                      className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={badgeClass}>{dueState}</Badge>
                            <Badge>{loan.months_paid}/{loan.term_months} paid</Badge>
                          </div>
                          <div className="font-medium text-white">{loan.title}</div>
                          <div className="text-xs text-white/50">
                            {loan.lender || "Unknown lender"} • Started {formatDate(loan.start_date)} •
                            Next due {loan.next_due_date ? ` ${formatDate(loan.next_due_date)}` : " complete"}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="flex items-center gap-2 text-sm font-medium text-white sm:justify-end">
                            <BellRing className="h-4 w-4 text-amber-300" />
                            {peso(loan.monthly_payment)}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            Remaining {loan.remainingPayments} month{loan.remainingPayments === 1 ? "" : "s"} •
                            {` ${peso(loan.remainingScheduled)}`}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={loanActionId === loan.id}
                          onClick={() => handleStartLoanEdit(loan)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={loanActionId === loan.id || loan.remainingPayments <= 0}
                          onClick={() => void handleLogLoanPayment(loan)}
                        >
                          <Wallet className="h-4 w-4" />
                          {loanActionId === loan.id ? "Logging..." : "Log Monthly Payment"}
                        </Button>
                      </div>
                      {loan.notes ? <div className="mt-3 text-sm text-white/62">{loan.notes}</div> : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
                  No active cash loans yet. Add one here and reminders will show up in this tab.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </ModalShell>

      <ModalShell
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        width="2xl"
        bodyClassName="max-h-[calc(100vh-8.5rem)] px-4 py-3 sm:px-5 sm:py-4"
        title={selectedEntry ? selectedEntry.title : "Cashflow details"}
        description={entryDetailsDescription}
        headerActions={
          selectedEntry ? (
            <div className="flex flex-wrap gap-2">
              {canEditSelectedEntry ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    handleEdit(selectedEntry);
                    setDetailsOpen(false);
                    ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              ) : null}
              {canDeleteSelectedEntry ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={deletingId === selectedEntry.id}
                  onClick={() => void handleDeleteFromDetails(selectedEntry)}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === selectedEntry.id ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selectedEntry ? (
          <div className="space-y-4 sm:space-y-5">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Type</div>
                <div className="mt-1.5 text-sm font-medium text-white sm:mt-2">{selectedEntry.flow_type}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Category</div>
                <div className="mt-1.5 text-sm font-medium text-white sm:mt-2">
                  {categoryLabel(selectedEntry.category)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Date</div>
                <div className="mt-1.5 text-sm font-medium text-white sm:mt-2">
                  {formatDate(selectedEntry.entry_date)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Amount</div>
                <div className="mt-1.5 text-sm font-medium text-white sm:mt-2">{peso(selectedEntry.amount)}</div>
              </div>
            </div>

            {detailsLoading ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/50">
                Loading record details...
              </div>
            ) : detailsError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-4 text-sm text-red-200">
                {detailsError}
              </div>
            ) : selectedEntry.source_type === "SALES_DAILY_SUBTOTAL" ? (
              <div className="space-y-4 sm:space-y-5">
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Orders</div>
                    <div className="mt-1.5 text-lg font-semibold text-white sm:mt-2 sm:text-xl">{detailOrders.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Items</div>
                    <div className="mt-1.5 text-lg font-semibold text-white sm:mt-2 sm:text-xl">{detailItems.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Units Sold</div>
                    <div className="mt-1.5 text-lg font-semibold text-white sm:mt-2 sm:text-xl">
                      {detailItems.reduce((sum, item) => sum + item.qty, 0)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
                  <section className="space-y-2.5 rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-3 sm:p-4 xl:max-h-[52vh] xl:overflow-y-auto xl:pr-2">
                  <div className="text-sm font-semibold text-white">All items</div>
                  {detailItemRollup.length ? (
                    detailItemRollup.map((item) => (
                      <div
                        key={item.key}
                        className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3"
                      >
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-medium text-white sm:text-[15px]">{item.name}</div>
                          <div className="text-xs text-white/50">
                            Qty {item.qty} • Sales {peso(item.sales)} • Cost {peso(item.cogs)}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm text-white/70">{peso(item.sales - item.cogs)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                      No sold items found for this record.
                    </div>
                  )}
                  </section>

                  <section className="space-y-2.5 rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-3 sm:p-4 xl:max-h-[52vh] xl:overflow-y-auto xl:pr-2">
                  <div className="text-sm font-semibold text-white">Orders</div>
                  {detailOrders.length ? (
                    detailOrders.map((order) => {
                      const orderItems = detailItemsByOrder.get(order.id) ?? [];
                      return (
                        <div
                          key={order.id}
                          className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-3 sm:p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="line-clamp-2 text-sm font-medium text-white sm:text-[15px]">
                                {order.customer_name || "Walk-in / Unnamed"}
                              </div>
                              <div className="mt-1 text-xs text-white/50">
                                {order.channel || "WEB"} • {order.payment_method || "Unknown"} •{" "}
                                {formatDateTime(order.paid_at ?? order.created_at)}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-white">{peso(order.total)}</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {orderItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="line-clamp-2 text-sm font-medium text-white">
                                    {item.item_name || item.product_title || item.variant_id || "Item"}
                                  </div>
                                  <div className="text-xs text-white/50">
                                    Qty {item.qty}
                                    {formatCondition(item.condition)
                                      ? ` • ${formatCondition(item.condition)}`
                                      : ""}
                                  </div>
                                </div>
                                <div className="shrink-0 text-sm text-white/72">
                                  {detailResolvedItemTotals.has(item.id)
                                    ? peso(detailResolvedItemTotals.get(item.id) ?? 0)
                                    : "Included in total"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                      No orders found for this sales subtotal.
                    </div>
                  )}
                  </section>
                </div>
              </div>
            ) : selectedEntry.source_type === "INVENTORY_COST_EVENT" ||
              selectedEntry.source_type === "INVENTORY_DAILY_SUBTOTAL" ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-white">
                  {selectedEntry.source_type === "INVENTORY_COST_EVENT"
                    ? "Inventory item"
                    : "Inventory items for this day"}
                </div>
                {detailInventoryEvents.length ? (
                  detailInventoryEvents.map((event) => {
                    const product = detailProducts[event.product_id];
                    const variant = detailVariants[event.variant_id];
                    const title =
                      product?.title ||
                      `${product?.brand ?? ""} ${product?.model ?? ""}`.trim() ||
                      event.product_id;
                    const isEditing = editingInventoryEventId === event.id && inventoryEventForm;
                    return (
                      <div
                        key={event.id}
                        className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium text-white">{title}</div>
                            <div className="mt-1 text-xs text-white/50">
                              {product?.brand ? `${product.brand} • ` : ""}
                              {formatCondition(variant?.condition) || formatCondition((event.meta?.condition as string | undefined) ?? null) || "Unknown condition"}
                              {" • "}
                              {event.movement_type.replaceAll("_", " ")}
                              {" • "}
                              {formatDateTime(event.occurred_at)}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <div className="text-right">
                              <div className="text-sm font-medium text-white">{peso(event.subtotal)}</div>
                              <div className="text-xs text-white/50">
                                {event.qty_added} x {peso(event.unit_cost)}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={detailSaving || detailDeletingId === event.id}
                              onClick={() => handleStartInventoryEventEdit(event)}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={detailSaving || detailDeletingId === event.id}
                              onClick={() => void handleDeleteInventoryEvent(event)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {detailDeletingId === event.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/10 p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Input
                                label="Entry Date"
                                type="date"
                                value={inventoryEventForm.entry_date}
                                onChange={(editEvent) =>
                                  setInventoryEventForm((current) =>
                                    current
                                      ? { ...current, entry_date: editEvent.target.value }
                                      : current
                                  )
                                }
                              />
                              <Input
                                label="Occurred At"
                                type="datetime-local"
                                value={inventoryEventForm.occurred_at}
                                onChange={(editEvent) =>
                                  setInventoryEventForm((current) =>
                                    current
                                      ? { ...current, occurred_at: editEvent.target.value }
                                      : current
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                              <Input
                                label="Quantity Added"
                                type="number"
                                min="1"
                                step="1"
                                value={inventoryEventForm.qty_added}
                                onChange={(editEvent) =>
                                  setInventoryEventForm((current) =>
                                    current
                                      ? { ...current, qty_added: editEvent.target.value }
                                      : current
                                  )
                                }
                              />
                              <Input
                                label="Unit Cost"
                                type="number"
                                min="0"
                                step="0.01"
                                value={inventoryEventForm.unit_cost}
                                onChange={(editEvent) =>
                                  setInventoryEventForm((current) =>
                                    current
                                      ? { ...current, unit_cost: editEvent.target.value }
                                      : current
                                  )
                                }
                              />
                              <Select
                                label="Movement Type"
                                value={inventoryEventForm.movement_type}
                                onChange={(editEvent) =>
                                  setInventoryEventForm((current) =>
                                    current
                                      ? { ...current, movement_type: editEvent.target.value }
                                      : current
                                  )
                                }
                              >
                                <option value="initial_stock">Initial stock</option>
                                <option value="restock">Restock</option>
                                <option value="increase">Increase</option>
                              </Select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                disabled={detailSaving}
                                onClick={() => void handleSaveInventoryEvent(event)}
                              >
                                <Pencil className="h-4 w-4" />
                                {detailSaving ? "Saving..." : "Save detail"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={detailSaving}
                                onClick={handleCancelInventoryEventEdit}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                    No linked inventory items found for this record.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-white">Manual ledger entry</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleEdit(selectedEntry);
                        setDetailsOpen(false);
                        ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={deletingId === selectedEntry.id}
                      onClick={() => void handleDeleteFromDetails(selectedEntry)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === selectedEntry.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
                <div className="mt-2">
                  {selectedEntry.notes || "No linked source items. This record was entered manually."}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}
