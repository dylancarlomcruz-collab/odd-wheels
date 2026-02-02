"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ShipClass } from "@/lib/shipping/config";

type VoucherRow = {
  id: string;
  code: string | null;
  title: string | null;
  kind: string;
  min_subtotal: number;
  shipping_cap: number;
  include_ship_classes: string[] | null;
  exclude_ship_classes: string[] | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
};

type VoucherForm = {
  code: string;
  title: string;
  min_subtotal: string;
  shipping_cap: string;
  include_ship_classes: ShipClass[];
  exclude_ship_classes: ShipClass[];
  starts_at: string;
  expires_at: string;
  is_active: boolean;
};

const EMPTY_FORM: VoucherForm = {
  code: "",
  title: "",
  min_subtotal: "0",
  shipping_cap: "0",
  include_ship_classes: [],
  exclude_ship_classes: [],
  starts_at: "",
  expires_at: "",
  is_active: true,
};

const SHIP_CLASS_OPTIONS: ShipClass[] = [
  "MINI_GT",
  "KAIDO",
  "POPRACE",
  "ACRYLIC_TRUE_SCALE",
  "TRUCKS",
  "BLISTER",
  "TOMICA",
  "HOT_WHEELS_MAINLINE",
  "HOT_WHEELS_PREMIUM",
  "LOOSE_NO_BOX",
  "LALAMOVE",
  "DIORAMA",
];

function formatShipClassLabel(value: string) {
  switch (value) {
    case "ACRYLIC_TRUE_SCALE":
      return "Acrylic True-Scale";
    case "HOT_WHEELS_MAINLINE":
      return "Hot Wheels Mainline";
    case "HOT_WHEELS_PREMIUM":
      return "Hot Wheels Premium";
    case "LOOSE_NO_BOX":
      return "Loose (No Box)";
    default:
      return value.replace(/_/g, " ");
  }
}

function toggleListValue<T extends string>(values: T[], value: T, next: boolean) {
  if (next) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((v) => v !== value);
}

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const adjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildPayload(form: VoucherForm) {
  return {
    code: form.code.trim() || null,
    title: form.title.trim() || null,
    kind: "FREE_SHIPPING",
    min_subtotal: Math.max(0, Number(form.min_subtotal) || 0),
    shipping_cap: Math.max(0, Number(form.shipping_cap) || 0),
    include_ship_classes: form.include_ship_classes.length
      ? form.include_ship_classes
      : null,
    exclude_ship_classes: form.exclude_ship_classes.length
      ? form.exclude_ship_classes
      : null,
    starts_at: fromDatetimeLocal(form.starts_at),
    expires_at: fromDatetimeLocal(form.expires_at),
    is_active: Boolean(form.is_active),
  };
}

function mapVoucherToForm(row: VoucherRow): VoucherForm {
  return {
    code: row.code ?? "",
    title: row.title ?? "",
    min_subtotal: String(row.min_subtotal ?? 0),
    shipping_cap: String(row.shipping_cap ?? 0),
    include_ship_classes: (row.include_ship_classes ?? []) as ShipClass[],
    exclude_ship_classes: (row.exclude_ship_classes ?? []) as ShipClass[],
    starts_at: toDatetimeLocal(row.starts_at),
    expires_at: toDatetimeLocal(row.expires_at),
    is_active: Boolean(row.is_active),
  };
}

export default function AdminVouchersPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [vouchers, setVouchers] = React.useState<VoucherRow[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, VoucherForm>>({});
  const [newVoucher, setNewVoucher] = React.useState<VoucherForm>(EMPTY_FORM);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createMsg, setCreateMsg] = React.useState<string | null>(null);
  const [grantUserId, setGrantUserId] = React.useState("");
  const [grantVoucherId, setGrantVoucherId] = React.useState("");
  const [grantExpiresAt, setGrantExpiresAt] = React.useState("");
  const [grantLoading, setGrantLoading] = React.useState(false);
  const [grantMsg, setGrantMsg] = React.useState<string | null>(null);
  const [syncLoading, setSyncLoading] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);

  const loadVouchers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("vouchers")
      .select(
        "id,code,title,kind,min_subtotal,shipping_cap,include_ship_classes,exclude_ship_classes,starts_at,expires_at,is_active"
      )
      .order("created_at", { ascending: false });

    if (loadError) {
      console.error(loadError);
      setError(loadError.message || "Failed to load vouchers.");
      setLoading(false);
      return;
    }

    const rows = (data as VoucherRow[]) ?? [];
    setVouchers(rows);
    const mapped: Record<string, VoucherForm> = {};
    rows.forEach((row) => {
      mapped[row.id] = mapVoucherToForm(row);
    });
    setDrafts(mapped);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  async function onCreateVoucher() {
    setCreateLoading(true);
    setCreateMsg(null);
    const payload = buildPayload(newVoucher);

    const { error: createError } = await supabase.from("vouchers").insert(payload);
    if (createError) {
      setCreateMsg(createError.message || "Failed to create voucher.");
      setCreateLoading(false);
      return;
    }

    setCreateMsg("Voucher created.");
    setNewVoucher(EMPTY_FORM);
    await loadVouchers();
    setCreateLoading(false);
  }

  async function onSaveVoucher(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    const payload = buildPayload(draft);

    const { error: updateError } = await supabase
      .from("vouchers")
      .update(payload)
      .eq("id", id);

    if (updateError) {
      alert(updateError.message || "Failed to update voucher.");
      setSavingId(null);
      return;
    }

    await loadVouchers();
    setSavingId(null);
  }

  async function onGrantVoucher() {
    if (!grantUserId.trim() || !grantVoucherId) {
      setGrantMsg("User ID and voucher are required.");
      return;
    }
    setGrantLoading(true);
    setGrantMsg(null);

    const payload = {
      user_id: grantUserId.trim(),
      voucher_id: grantVoucherId,
      expires_at: fromDatetimeLocal(grantExpiresAt),
    };

    const { error: grantError } = await supabase
      .from("voucher_wallet")
      .upsert(payload, { onConflict: "user_id,voucher_id,expires_at" });

    if (grantError) {
      setGrantMsg(grantError.message || "Failed to grant voucher.");
      setGrantLoading(false);
      return;
    }

    setGrantMsg("Voucher granted.");
    setGrantUserId("");
    setGrantVoucherId("");
    setGrantExpiresAt("");
    setGrantLoading(false);
  }

  async function onSyncSpendVouchers() {
    setSyncLoading(true);
    setSyncMsg(null);

    const { data, error: grantError } = await supabase.rpc(
      "fn_grant_spend_vouchers_for_all"
    );

    if (grantError) {
      setSyncMsg(grantError.message || "Failed to sync spend vouchers.");
      setSyncLoading(false);
      return;
    }

    setSyncMsg(`Spend vouchers synced. Rows: ${data?.granted ?? 0}.`);
    setSyncLoading(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Vouchers</div>
          <div className="text-sm text-white/60">
            Create and manage free-shipping vouchers.
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="text-sm font-semibold">Create voucher</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Code"
                value={newVoucher.code}
                onChange={(e) =>
                  setNewVoucher((prev) => ({ ...prev, code: e.target.value }))
                }
              />
              <Input
                label="Title"
                value={newVoucher.title}
                onChange={(e) =>
                  setNewVoucher((prev) => ({ ...prev, title: e.target.value }))
                }
              />
              <Input
                label="Min subtotal"
                type="number"
                min={0}
                step={1}
                value={newVoucher.min_subtotal}
                onChange={(e) =>
                  setNewVoucher((prev) => ({
                    ...prev,
                    min_subtotal: e.target.value,
                  }))
                }
              />
              <Input
                label="Shipping cap"
                type="number"
                min={0}
                step={1}
                value={newVoucher.shipping_cap}
                onChange={(e) =>
                  setNewVoucher((prev) => ({
                    ...prev,
                    shipping_cap: e.target.value,
                  }))
                }
              />
              <Input
                label="Starts at"
                type="datetime-local"
                value={newVoucher.starts_at}
                onChange={(e) =>
                  setNewVoucher((prev) => ({ ...prev, starts_at: e.target.value }))
                }
              />
              <Input
                label="Expires at"
                type="datetime-local"
                value={newVoucher.expires_at}
                onChange={(e) =>
                  setNewVoucher((prev) => ({ ...prev, expires_at: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-white/50">
                Include ship classes
              </div>
              <div className="flex flex-wrap gap-3">
                {SHIP_CLASS_OPTIONS.map((shipClass) => (
                  <Checkbox
                    key={`create-include-${shipClass}`}
                    checked={newVoucher.include_ship_classes.includes(shipClass)}
                    onChange={(next) =>
                      setNewVoucher((prev) => ({
                        ...prev,
                        include_ship_classes: toggleListValue(
                          prev.include_ship_classes,
                          shipClass,
                          next
                        ),
                      }))
                    }
                    label={formatShipClassLabel(shipClass)}
                  />
                ))}
              </div>
              <div className="text-xs text-white/50">
                Leave empty to allow all classes. Exclude overrides include.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-white/50">
                Exclude ship classes
              </div>
              <div className="flex flex-wrap gap-3">
                {SHIP_CLASS_OPTIONS.map((shipClass) => (
                  <Checkbox
                    key={`create-exclude-${shipClass}`}
                    checked={newVoucher.exclude_ship_classes.includes(shipClass)}
                    onChange={(next) =>
                      setNewVoucher((prev) => ({
                        ...prev,
                        exclude_ship_classes: toggleListValue(
                          prev.exclude_ship_classes,
                          shipClass,
                          next
                        ),
                      }))
                    }
                    label={formatShipClassLabel(shipClass)}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={newVoucher.is_active}
                onChange={(e) =>
                  setNewVoucher((prev) => ({ ...prev, is_active: e.target.checked }))
                }
                className="h-4 w-4"
              />
              Active
            </label>
            <div className="flex items-center gap-3">
              <Button onClick={onCreateVoucher} disabled={createLoading}>
                {createLoading ? "Creating..." : "Create voucher"}
              </Button>
              {createMsg ? <div className="text-xs text-white/60">{createMsg}</div> : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Existing vouchers</div>
            {loading ? (
              <div className="text-sm text-white/60">Loading...</div>
            ) : vouchers.length === 0 ? (
              <div className="text-sm text-white/60">No vouchers found.</div>
            ) : (
              <div className="space-y-4">
                {vouchers.map((voucher) => {
                  const draft = drafts[voucher.id];
                  if (!draft) return null;
                  return (
                    <div
                      key={voucher.id}
                      className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3"
                    >
                      <div className="text-sm font-semibold">
                        {voucher.title || voucher.code || voucher.id.slice(0, 8)}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="Code"
                          value={draft.code}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: { ...draft, code: e.target.value },
                            }))
                          }
                        />
                        <Input
                          label="Title"
                          value={draft.title}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: { ...draft, title: e.target.value },
                            }))
                          }
                        />
                        <Input
                          label="Min subtotal"
                          type="number"
                          min={0}
                          step={1}
                          value={draft.min_subtotal}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: {
                                ...draft,
                                min_subtotal: e.target.value,
                              },
                            }))
                          }
                        />
                        <Input
                          label="Shipping cap"
                          type="number"
                          min={0}
                          step={1}
                          value={draft.shipping_cap}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: {
                                ...draft,
                                shipping_cap: e.target.value,
                              },
                            }))
                          }
                        />
                        <Input
                          label="Starts at"
                          type="datetime-local"
                          value={draft.starts_at}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: { ...draft, starts_at: e.target.value },
                            }))
                          }
                        />
                        <Input
                          label="Expires at"
                          type="datetime-local"
                          value={draft.expires_at}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: { ...draft, expires_at: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs uppercase text-white/50">
                          Include ship classes
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {SHIP_CLASS_OPTIONS.map((shipClass) => (
                            <Checkbox
                              key={`edit-include-${voucher.id}-${shipClass}`}
                              checked={draft.include_ship_classes.includes(shipClass)}
                              onChange={(next) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [voucher.id]: {
                                    ...draft,
                                    include_ship_classes: toggleListValue(
                                      draft.include_ship_classes,
                                      shipClass,
                                      next
                                    ),
                                  },
                                }))
                              }
                              label={formatShipClassLabel(shipClass)}
                            />
                          ))}
                        </div>
                        <div className="text-xs text-white/50">
                          Leave empty to allow all classes. Exclude overrides include.
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs uppercase text-white/50">
                          Exclude ship classes
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {SHIP_CLASS_OPTIONS.map((shipClass) => (
                            <Checkbox
                              key={`edit-exclude-${voucher.id}-${shipClass}`}
                              checked={draft.exclude_ship_classes.includes(shipClass)}
                              onChange={(next) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [voucher.id]: {
                                    ...draft,
                                    exclude_ship_classes: toggleListValue(
                                      draft.exclude_ship_classes,
                                      shipClass,
                                      next
                                    ),
                                  },
                                }))
                              }
                              label={formatShipClassLabel(shipClass)}
                            />
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-white/70">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [voucher.id]: {
                                ...draft,
                                is_active: e.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4"
                        />
                        Active
                      </label>
                      <Button
                        size="sm"
                        onClick={() => onSaveVoucher(voucher.id)}
                        disabled={savingId === voucher.id}
                      >
                        {savingId === voucher.id ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Grant voucher to user</div>
          <div className="text-sm text-white/60">
            Manually assign a voucher to a user wallet.
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="User ID"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              placeholder="uuid"
            />
            <Select
              label="Voucher"
              value={grantVoucherId}
              onChange={(e) => setGrantVoucherId(e.target.value)}
            >
              <option value="">Select a voucher</option>
              {vouchers.map((voucher) => (
                <option key={voucher.id} value={voucher.id}>
                  {voucher.code || voucher.title || voucher.id.slice(0, 8)}
                </option>
              ))}
            </Select>
            <Input
              label="Expires at (optional)"
              type="datetime-local"
              value={grantExpiresAt}
              onChange={(e) => setGrantExpiresAt(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={onGrantVoucher} disabled={grantLoading}>
              {grantLoading ? "Granting..." : "Grant voucher"}
            </Button>
            {grantMsg ? <div className="text-xs text-white/60">{grantMsg}</div> : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Spend voucher sync</div>
          <div className="text-sm text-white/60">
            Backfill spend-based vouchers for all users.
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <Button onClick={onSyncSpendVouchers} disabled={syncLoading}>
            {syncLoading ? "Syncing..." : "Sync spend vouchers"}
          </Button>
          {syncMsg ? <div className="text-xs text-white/60">{syncMsg}</div> : null}
        </CardBody>
      </Card>
    </div>
  );
}
