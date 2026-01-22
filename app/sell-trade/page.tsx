"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { formatTitle } from "@/lib/text";
import {
  TradeInventoryPicker,
  type TradePick,
} from "@/components/trade/TradeInventoryPicker";

type OfferItem = {
  id: string;
  brands: string;
  condition: string;
  notes: string;
};

type PhotoItem = {
  id: string;
  file: File;
  preview: string;
};

const CONDITIONS = ["SEALED", "UNSEALED", "SEALED AND UNSEALED"];
const SHIPPING_METHODS = [
  { value: "", label: "Select a method" },
  { value: "JNT", label: "J&T Delivery" },
  { value: "LALAMOVE", label: "Lalamove" },
  { value: "LBC", label: "LBC Branch Drop" },
  { value: "DROPOFF", label: "Drop-off at R Square Mall, Vito Cruz" },
];
const PAYOUT_METHODS = [
  { value: "", label: "Select payout method" },
  { value: "GCASH", label: "GCash" },
  { value: "BANK", label: "Bank transfer" },
  { value: "CASH", label: "Cash on pickup/drop-off" },
];

const PHOTO_BUCKET = "sell-trade-uploads";
const MAX_PHOTOS = 8;

function parseNumber(raw: string) {
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}


function toSafeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function buildNewItem(): OfferItem {
  return {
    id: crypto.randomUUID(),
    brands: "",
    condition: "SEALED",
    notes: "",
  };
}

export default function SellTradePage() {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [mode, setMode] = React.useState<"SELL" | "TRADE">("SELL");
  const [items, setItems] = React.useState<OfferItem[]>([buildNewItem()]);
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [issuePhotos, setIssuePhotos] = React.useState<PhotoItem[]>([]);
  const [issuePhotoError, setIssuePhotoError] = React.useState<string | null>(null);

  const [targetPrice, setTargetPrice] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [shippingMethod, setShippingMethod] = React.useState("");
  const [shippingNotes, setShippingNotes] = React.useState("");
  const [payoutMethod, setPayoutMethod] = React.useState("");
  const [cashAddOn, setCashAddOn] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [submitMsg, setSubmitMsg] = React.useState<string | null>(null);

  const [tradePicks, setTradePicks] = React.useState<TradePick[]>([]);
  const submitRef = React.useRef<HTMLDivElement | null>(null);

  const photosRef = React.useRef<PhotoItem[]>([]);
  const issuePhotosRef = React.useRef<PhotoItem[]>([]);

  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  React.useEffect(() => {
    issuePhotosRef.current = issuePhotos;
  }, [issuePhotos]);

  React.useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
      for (const p of issuePhotosRef.current) URL.revokeObjectURL(p.preview);
    };
  }, []);

  function updateItem(id: string, patch: Partial<OfferItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, buildNewItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function addPhotoList(
    list: FileList | null,
    current: PhotoItem[],
    setList: React.Dispatch<React.SetStateAction<PhotoItem[]>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    label: string
  ) {
    if (!list) return;
    const incoming = Array.from(list);
    if (current.length + incoming.length > MAX_PHOTOS) {
      setError(`${label} photo limit is ${MAX_PHOTOS}.`);
      return;
    }
    setError(null);
    const next = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setList((prev) => [...prev, ...next]);
  }

  function onAddPhotos(list: FileList | null) {
    addPhotoList(list, photos, setPhotos, setPhotoError, "Item");
  }

  function onAddIssuePhotos(list: FileList | null) {
    addPhotoList(list, issuePhotos, setIssuePhotos, setIssuePhotoError, "Issue");
  }

  function removePhoto(id: string, setList: React.Dispatch<React.SetStateAction<PhotoItem[]>>) {
    setList((prev) => {
      const match = prev.find((p) => p.id === id);
      if (match) URL.revokeObjectURL(match.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadPhotos(
    requestId: string,
    list: PhotoItem[],
    prefix: string
  ): Promise<string[]> {
    if (!user || list.length === 0) return [];
    const urls: string[] = [];
    for (const [index, p] of list.entries()) {
      const safeName = toSafeFileName(p.file.name || `photo-${index + 1}.jpg`);
      const path = `${user.id}/${requestId}/${prefix}-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, p.file, {
          contentType: p.file.type || "image/jpeg",
          upsert: false,
        });
      if (error) throw error;
      const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  async function submitRequest() {
    setSubmitMsg(null);
    if (!user) {
      setSubmitMsg("Please log in to submit a request.");
      return;
    }
    const hasItems = items.some(
      (item) => item.brands.trim() || item.notes.trim()
    );
    if (!hasItems) {
      setSubmitMsg("Add at least one brand or item note.");
      return;
    }
    if (!shippingMethod) {
      setSubmitMsg("Select your shipping or drop-off method.");
      return;
    }
    if (mode === "TRADE" && tradePicks.length === 0) {
      setSubmitMsg("Select at least one shop item for your trade request.");
      return;
    }

    setSubmitting(true);
    try {
      const requestId = crypto.randomUUID();
      const photoUrls = await uploadPhotos(requestId, photos, "items");
      const issuePhotoUrls = await uploadPhotos(
        requestId,
        issuePhotos,
        "issues"
      );
      const cleanedItems = items
        .filter((item) => item.brands.trim() || item.notes.trim())
        .map((item) => ({
          brands: item.brands.trim() || null,
          condition: item.condition,
          notes: item.notes.trim() || null,
        }));

      const payload = {
        items: cleanedItems,
        target_price: parseNumber(targetPrice),
        notes: notes.trim() || null,
        shipping: {
          method: shippingMethod,
          details: shippingNotes.trim() || null,
        },
        payout_method: payoutMethod || null,
        cash_add_on: parseNumber(cashAddOn),
        issue_photo_urls: issuePhotoUrls,
        trade_desired_items: mode === "TRADE" ? tradePicks : [],
        contact: {
          name: profile?.full_name ?? null,
          phone: profile?.contact_number ?? null,
          email: profile?.email ?? user.email ?? null,
        },
      };

      const { error } = await supabase.from("sell_trade_requests").insert({
        id: requestId,
        user_id: user.id,
        request_type: mode,
        status: "PENDING",
        customer_name: profile?.full_name ?? null,
        customer_contact: profile?.contact_number ?? null,
        customer_email: profile?.email ?? user.email ?? null,
        shipping_method: shippingMethod,
        payload,
        photo_urls: photoUrls,
        desired_items: mode === "TRADE" ? tradePicks : null,
      });

      if (error) throw error;

      setSubmitMsg("Request submitted! We will review and message you soon.");
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
      for (const p of issuePhotosRef.current) URL.revokeObjectURL(p.preview);
      setItems([buildNewItem()]);
      setPhotos([]);
      setPhotoError(null);
      setIssuePhotos([]);
      setIssuePhotoError(null);
      setTargetPrice("");
      setNotes("");
      setShippingMethod("");
      setShippingNotes("");
      setPayoutMethod("");
      setCashAddOn("");
      setTradePicks([]);
    } catch (e: any) {
      console.error(e);
      setSubmitMsg(e?.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasItems = items.some(
    (item) => item.brands.trim() || item.notes.trim()
  );
  const canSubmit =
    Boolean(user) &&
    hasItems &&
    Boolean(shippingMethod) &&
    (mode === "SELL" || tradePicks.length > 0) &&
    !submitting;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sell / Trade</h1>
          <p className="text-sm text-white/60">
            Share your items, choose sell or trade, and we will respond with an offer.
          </p>
        </div>
        <div className="flex gap-2 rounded-full border border-white/10 bg-bg-900/60 p-1">
          <button
            type="button"
            onClick={() => setMode("SELL")}
            className={[
              "rounded-full px-4 py-2 text-sm",
              mode === "SELL"
                ? "bg-amber-600 text-black"
                : "text-white/70 hover:text-white",
            ].join(" ")}
          >
            Sell
          </button>
          <button
            type="button"
            onClick={() => setMode("TRADE")}
            className={[
              "rounded-full px-4 py-2 text-sm",
              mode === "TRADE"
                ? "bg-amber-600 text-black"
                : "text-white/70 hover:text-white",
            ].join(" ")}
          >
            Trade
          </button>
        </div>
      </div>

      {!user ? (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Log in required</div>
            <div className="text-sm text-white/60">
              Please log in to submit a sell or trade request so we can follow up.
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {mode === "SELL" ? (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">
              {formatTitle("Selling policy")}
            </div>
            <div className="text-sm text-white/60">How we arrive at offers.</div>
          </CardHeader>
          <CardBody className="space-y-3 text-sm text-white/70">
            <p>
              Our offers include a processing and handling fee of 30% or more. This
              covers the time spent sourcing and checking the item,
              packing and admin tasks, and helps account for swap risk or possible
              price differences. Thanks for understanding!
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">
              {formatTitle("Trade policy")}
            </div>
            <div className="text-sm text-white/60">Set expectations for trades.</div>
          </CardHeader>
          <CardBody className="space-y-3 text-sm text-white/70">
            <p>
              Our trade pricing includes a processing and handling fee of 30% or
              more. This covers the time spent sourcing and checking the item,
              packing and admin tasks, and helps account for swap risk or possible
              price differences. Thanks for understanding!
            </p>
            <p>
              Shipping both ways is customer-paid unless you drop off at the shop, and
              we may request extra items or cash to balance or remove items based on
              availability and condition.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">
              {formatTitle("Items + Photos")}
            </div>
            <div className="text-sm text-white/60">
              List brands and condition. You can group multiple items in one entry.
            </div>
          </div>
          <Badge>{items.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-paper/5 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {formatTitle(`Item ${idx + 1}`)}
                </div>
                {items.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Brands (comma-separated)"
                  value={item.brands}
                  onChange={(e) => updateItem(item.id, { brands: e.target.value })}
                  placeholder="minigt, poprace, inno64"
                />
                <Select
                  label="Condition"
                  value={item.condition}
                  onChange={(e) => updateItem(item.id, { condition: e.target.value })}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <div className="md:col-span-2">
                  <Textarea
                    label="Notes (optional)"
                    value={item.notes}
                    onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                    placeholder="Any quick notes about the bundle or issues."
                  />
                </div>
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={addItem}>
            Add another group (optional)
          </Button>

          {mode === "TRADE" ? (
            <div className="rounded-xl border border-white/10 bg-bg-900/30 p-3 space-y-2">
              <Input
                label="Add cash (optional)"
                value={cashAddOn}
                onChange={(e) => setCashAddOn(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1500"
              />
              <div className="text-xs text-white/50">
                Optional top-up to balance your trade request.
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold">
                {formatTitle("Photos (items + issues)")}
              </div>
              <div className="text-xs text-white/50">
                You can upload one group photo. Add issue close-ups if any.
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">
                  {formatTitle("Item photos")}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    onAddPhotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  className="block w-full text-sm"
                />
                {photoError ? <div className="text-sm text-red-300">{photoError}</div> : null}
                {photos.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {photos.map((p) => (
                      <div key={p.id} className="relative rounded-xl border border-white/10 bg-bg-900/30 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="Upload preview" className="h-24 w-full rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id, setPhotos)}
                          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">No item photos yet.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Issue photos (optional)</div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    onAddIssuePhotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  className="block w-full text-sm"
                />
                {issuePhotoError ? (
                  <div className="text-sm text-red-300">{issuePhotoError}</div>
                ) : null}
                {issuePhotos.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {issuePhotos.map((p) => (
                      <div key={p.id} className="relative rounded-xl border border-white/10 bg-bg-900/30 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="Issue preview" className="h-24 w-full rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id, setIssuePhotos)}
                          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">No issue photos yet.</div>
                )}
              </div>
            </div>
            <div className="text-xs text-white/50">
              Max {MAX_PHOTOS} photos per section.
            </div>
          </div>
        </CardBody>
      </Card>

      {mode === "TRADE" ? (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Trade wishlist</div>
            <div className="text-sm text-white/60">
              Browse the shop and pick what you want in return.
            </div>
          </CardHeader>
          <CardBody>
            <TradeInventoryPicker
              picks={tradePicks}
              onChange={setTradePicks}
              onContinue={() => submitRef.current?.scrollIntoView({ behavior: "smooth" })}
            />
          </CardBody>
        </Card>
      ) : null}

      {mode === "SELL" ? (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Quick details</div>
            <div className="text-sm text-white/60">
              Optional targets and notes to guide our offer.
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Target payout (optional)"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 5000"
              />
              <Select
                label="Preferred payout method (optional)"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
              >
                {PAYOUT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <div className="md:col-span-2">
                <Textarea
                  label="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any extra context you want us to know."
                />
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Shipping / Drop-off</div>
          <div className="text-sm text-white/60">
            Choose how you can send or drop items. We will confirm details after review.
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="Shipping or drop-off method"
            value={shippingMethod}
            onChange={(e) => setShippingMethod(e.target.value)}
          >
            {SHIPPING_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Textarea
            label="Shipping notes (optional)"
            value={shippingNotes}
            onChange={(e) => setShippingNotes(e.target.value)}
            placeholder="LBC branch, pickup time, or drop-off schedule."
          />
          <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 text-sm text-white/70">
            Drop-off location: R Square Mall, Vito Cruz. We will message you to confirm the schedule.
          </div>
        </CardBody>
      </Card>

      <div ref={submitRef}>
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Submit request</div>
            <div className="text-sm text-white/60">
              Admin can approve, counteroffer, or reject with a reason. You will be notified.
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {submitMsg ? <div className="text-sm text-white/70">{submitMsg}</div> : null}
            <Button onClick={submitRequest} disabled={!canSubmit}>
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
            {!hasItems ? (
              <div className="text-xs text-red-300">Add at least one brand or note to continue.</div>
            ) : null}
            {!shippingMethod ? (
              <div className="text-xs text-red-300">Select a shipping or drop-off method.</div>
            ) : null}
            {mode === "TRADE" && tradePicks.length === 0 ? (
              <div className="text-xs text-red-300">Pick at least one shop item for trade.</div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
