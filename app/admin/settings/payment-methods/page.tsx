"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type PaymentMethodForm = {
  id: string;
  method: string;
  label: string;
  account_number: string;
  account_name: string;
  instructions: string;
  qr_image_url: string;
  is_active: boolean;
};

const emptyNewMethod = {
  method: "",
  label: "",
  account_number: "",
  account_name: "",
  instructions: "",
  is_active: true,
};

function toUpperMethod(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function nullIfEmpty(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export default function PaymentMethodsPage() {
  const [methods, setMethods] = React.useState<PaymentMethodForm[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [uploadingId, setUploadingId] = React.useState<string | null>(null);
  const [rowMsg, setRowMsg] = React.useState<Record<string, string>>({});
  const [newMethod, setNewMethod] = React.useState({ ...emptyNewMethod });
  const [newMsg, setNewMsg] = React.useState<string | null>(null);

  async function loadMethods() {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .order("method", { ascending: true });

    if (error) {
      console.error(error);
    }

    const mapped = (data ?? []).map((m: any) => ({
      id: m.id,
      method: m.method ?? "",
      label: m.label ?? "",
      account_number: m.account_number ?? "",
      account_name: m.account_name ?? "",
      instructions: m.instructions ?? "",
      qr_image_url: m.qr_image_url ?? "",
      is_active: Boolean(m.is_active ?? false),
    }));

    setMethods(mapped);
    setLoading(false);
  }

  React.useEffect(() => {
    loadMethods();
  }, []);

  function updateMethod(id: string, patch: Partial<PaymentMethodForm>) {
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function saveMethod(method: PaymentMethodForm) {
    const label = method.label.trim();
    if (!label) {
      setRowMsg((prev) => ({ ...prev, [method.id]: "Label is required." }));
      return;
    }

    setSavingId(method.id);
    setRowMsg((prev) => ({ ...prev, [method.id]: "" }));

    const payload = {
      label,
      account_number: nullIfEmpty(method.account_number),
      account_name: nullIfEmpty(method.account_name),
      instructions: nullIfEmpty(method.instructions),
      is_active: method.is_active,
    };

    const { error } = await supabase
      .from("payment_methods")
      .update(payload)
      .eq("id", method.id);

    if (error) {
      setRowMsg((prev) => ({ ...prev, [method.id]: error.message }));
    } else {
      setRowMsg((prev) => ({ ...prev, [method.id]: "Saved." }));
    }

    setSavingId(null);
  }

  async function addMethod() {
    setNewMsg(null);
    const methodCode = toUpperMethod(newMethod.method);
    const label = newMethod.label.trim();

    if (!methodCode) {
      setNewMsg("Method code is required.");
      return;
    }
    if (!label) {
      setNewMsg("Label is required.");
      return;
    }

    const payload = {
      method: methodCode,
      label,
      account_number: nullIfEmpty(newMethod.account_number),
      account_name: nullIfEmpty(newMethod.account_name),
      instructions: nullIfEmpty(newMethod.instructions),
      is_active: newMethod.is_active,
    };

    const { data, error } = await supabase
      .from("payment_methods")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setNewMsg(error.message);
      return;
    }

    setMethods((prev) => [
      {
        id: data.id,
        method: data.method ?? methodCode,
        label: data.label ?? label,
        account_number: data.account_number ?? "",
        account_name: data.account_name ?? "",
        instructions: data.instructions ?? "",
        qr_image_url: data.qr_image_url ?? "",
        is_active: Boolean(data.is_active ?? true),
      },
      ...prev,
    ]);
    setNewMethod({ ...emptyNewMethod });
    setNewMsg("Added.");
  }

  async function uploadQr(method: PaymentMethodForm, file: File) {
    setUploadingId(method.id);
    setRowMsg((prev) => ({ ...prev, [method.id]: "" }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const form = new FormData();
      form.append("file", file);
      form.append("method", method.method);

      const res = await fetch("/api/admin/payment-qr/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await res.json();
      if (!json?.ok || !json?.publicUrl) {
        throw new Error(json?.error ?? "Upload failed.");
      }

      const publicUrl = String(json.publicUrl);
      const { error } = await supabase
        .from("payment_methods")
        .update({ qr_image_url: publicUrl })
        .eq("id", method.id);

      if (error) throw error;

      updateMethod(method.id, { qr_image_url: publicUrl });
      setRowMsg((prev) => ({ ...prev, [method.id]: "QR updated." }));
    } catch (err: any) {
      setRowMsg((prev) => ({
        ...prev,
        [method.id]: err?.message ?? "Upload failed.",
      }));
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Payment Methods</div>
          <div className="text-sm text-white/60">
            Edit payment instructions that buyers see after approval.
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Add new method</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Method code (unique, uppercase)"
                value={newMethod.method}
                onChange={(e) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    method: toUpperMethod(e.target.value),
                  }))
                }
                placeholder="GCASH"
              />
              <Input
                label="Label"
                value={newMethod.label}
                onChange={(e) =>
                  setNewMethod((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="GCash"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Account number"
                value={newMethod.account_number}
                onChange={(e) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    account_number: e.target.value,
                  }))
                }
              />
              <Input
                label="Account name"
                value={newMethod.account_name}
                onChange={(e) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    account_name: e.target.value,
                  }))
                }
              />
            </div>
            <Textarea
              label="Instructions (optional)"
              value={newMethod.instructions}
              onChange={(e) =>
                setNewMethod((prev) => ({
                  ...prev,
                  instructions: e.target.value,
                }))
              }
            />
            <Checkbox
              checked={newMethod.is_active}
              onChange={(value) =>
                setNewMethod((prev) => ({ ...prev, is_active: value }))
              }
              label="Active"
            />
            {newMsg ? <div className="text-xs text-white/60">{newMsg}</div> : null}
            <Button onClick={addMethod}>Add method</Button>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        {loading ? <div className="text-white/60">Loading...</div> : null}
        {!loading && methods.length === 0 ? (
          <div className="text-white/60">No payment methods found.</div>
        ) : null}
        {methods.map((method) => (
          <Card key={method.id}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{method.label || method.method}</div>
                <div className="text-xs text-white/60">Code: {method.method}</div>
              </div>
              <Badge
                className={
                  method.is_active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-bg-900/30 text-white/60"
                }
              >
                {method.is_active ? "Active" : "Inactive"}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Method code" value={method.method} disabled />
                <Input
                  label="Label"
                  value={method.label}
                  onChange={(e) =>
                    updateMethod(method.id, { label: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Account number"
                  value={method.account_number}
                  onChange={(e) =>
                    updateMethod(method.id, { account_number: e.target.value })
                  }
                />
                <Input
                  label="Account name"
                  value={method.account_name}
                  onChange={(e) =>
                    updateMethod(method.id, { account_name: e.target.value })
                  }
                />
              </div>
              <Textarea
                label="Instructions (optional)"
                value={method.instructions}
                onChange={(e) =>
                  updateMethod(method.id, { instructions: e.target.value })
                }
              />
              <div className="rounded-xl border border-white/10 bg-bg-900/30 p-3 space-y-2">
                <div className="font-semibold text-sm">QR code</div>
                {method.qr_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={method.qr_image_url}
                    alt={`${method.label || method.method} QR`}
                    className="h-32 w-32 rounded-lg bg-white object-contain"
                  />
                ) : (
                  <div className="text-xs text-white/60">No QR uploaded.</div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingId === method.id}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await uploadQr(method, file);
                    e.target.value = "";
                  }}
                />
                {uploadingId === method.id ? (
                  <div className="text-xs text-white/60">Uploading...</div>
                ) : null}
              </div>
              <Checkbox
                checked={method.is_active}
                onChange={(value) => updateMethod(method.id, { is_active: value })}
                label="Active"
              />
              {rowMsg[method.id] ? (
                <div className="text-xs text-white/60">{rowMsg[method.id]}</div>
              ) : null}
              <Button onClick={() => saveMethod(method)} disabled={savingId === method.id}>
                {savingId === method.id ? "Saving..." : "Save changes"}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
