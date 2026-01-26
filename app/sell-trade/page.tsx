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
import { formatTitle } from "@/lib/text";
import {
  TradeInventoryPicker,
  type TradePick,
} from "@/components/trade/TradeInventoryPicker";

type PhotoItem = {
  id: string;
  file: File;
  preview: string;
};

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

export default function SellTradePage() {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [mode, setMode] = React.useState<"SELL" | "TRADE">("SELL");
  const [itemDetails, setItemDetails] = React.useState("");
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

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
  const addPhotosRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  React.useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
    };
  }, []);

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
    if (!itemDetails.trim()) {
      setSubmitMsg("Add your item details.");
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
      const cleanedItems = itemDetails.trim()
        ? [
            {
              brands: itemDetails.trim(),
              condition: null,
              notes: null,
            },
          ]
        : [];

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
      setItemDetails("");
      setPhotos([]);
      setPhotoError(null);
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

  const hasItems = Boolean(itemDetails.trim());
  const canSubmit =
    Boolean(user) &&
    hasItems &&
    Boolean(shippingMethod) &&
    (mode === "SELL" || tradePicks.length > 0) &&
    !submitting;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Sell / Trade</h1>
          <p className="text-xs text-white/60">
            Share your items, choose sell or trade, and we will respond with an offer.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 bg-bg-900/60 p-1">
          <button
            type="button"
            onClick={() => setMode("SELL")}
            className={[
              "rounded-full px-3 py-1.5 text-xs",
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
              "rounded-full px-3 py-1.5 text-xs",
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
          <CardHeader className="p-3">
            <div className="text-base font-semibold">Log in required</div>
            <div className="text-xs text-white/60">
              Please log in to submit a sell or trade request so we can follow up.
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {mode === "SELL" ? (
        <Card>
          <CardHeader className="p-3">
            <div className="text-base font-semibold">
              {formatTitle("Selling policy")}
            </div>
            <div className="text-xs text-white/60">How we arrive at offers.</div>
          </CardHeader>
          <CardBody className="p-3 text-xs text-white/70">
            Our offers include a processing and handling fee of 30% or more. This
            covers the time spent sourcing and checking the item, packing and admin
            tasks, and helps account for swap risk or possible price differences.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="p-3">
            <div className="text-base font-semibold">
              {formatTitle("Trade policy")}
            </div>
            <div className="text-xs text-white/60">Set expectations for trades.</div>
          </CardHeader>
          <CardBody className="space-y-2 p-3 text-xs text-white/70">
            <p>
              Our trade pricing includes a processing and handling fee of 30% or
              more. This covers the time spent sourcing and checking the item,
              packing and admin tasks, and helps account for swap risk or possible
              price differences.
            </p>
            <p>
              Shipping both ways is customer-paid unless you drop off at the shop,
              and we may request extra items or cash to balance or remove items based
              on availability and condition.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="p-3">
          <div>
            <div className="text-base font-semibold">
              {formatTitle("Items + Photos")}
            </div>
            <div className="text-xs text-white/60">
              Describe everything in one input and add multiple photos.
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 p-3">
          <div className="rounded-2xl border border-white/10 bg-paper/5 p-3 space-y-2">
            <Textarea
              label="Item details"
              value={itemDetails}
              onChange={(e) => setItemDetails(e.target.value)}
              placeholder="List all items, quantities, conditions, and notes."
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/50">
                You can upload multiple photos.
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={addPhotosRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    onAddPhotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addPhotosRef.current?.click()}
                >
                  Add photos
                </Button>
              </div>
            </div>
            {photoError ? (
              <div className="text-sm text-red-300">{photoError}</div>
            ) : null}
          </div>

          {photos.length ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="relative rounded-xl border border-white/10 bg-bg-900/30 p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.preview}
                    alt="Upload preview"
                    className="h-24 w-full rounded-lg object-cover"
                  />
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
          <div className="text-xs text-white/50">
            Max {MAX_PHOTOS} photos.
          </div>

          {mode === "TRADE" ? (
            <div className="rounded-xl border border-white/10 bg-bg-900/30 p-2">
              <Input
                label="Add cash (optional)"
                value={cashAddOn}
                onChange={(e) => setCashAddOn(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1500"
                hint="Optional top-up to balance your trade request."
              />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {mode === "TRADE" ? (
        <Card>
          <CardHeader className="p-3">
            <div className="text-base font-semibold">Trade wishlist</div>
            <div className="text-xs text-white/60">
              Browse the shop and pick what you want in return.
            </div>
          </CardHeader>
          <CardBody className="p-3">
            <TradeInventoryPicker
              picks={tradePicks}
              onChange={setTradePicks}
              onContinue={() => submitRef.current?.scrollIntoView({ behavior: "smooth" })}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="p-3">
          <div className="text-base font-semibold">Details + Shipping</div>
          <div className="text-xs text-white/60">
            Add optional details and choose how you can send or drop items.
          </div>
        </CardHeader>
        <CardBody className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mode === "SELL" ? (
              <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-3">
                <div className="text-sm font-semibold text-white/80">
                  Quick details (optional)
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
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
                  <Textarea
                    label="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any extra context you want us to know."
                  />
                </div>
              </div>
            ) : null}

            <div className={mode === "SELL" ? "" : "md:col-span-2"}>
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
              <div className="mt-2">
                <Textarea
                  label="Shipping notes (optional)"
                  value={shippingNotes}
                  onChange={(e) => setShippingNotes(e.target.value)}
                  placeholder="LBC branch, pickup time, or drop-off schedule."
                />
              </div>
              <div className="mt-2 rounded-xl border border-white/10 bg-bg-950/40 p-2 text-xs text-white/70">
                Drop-off location: R Square Mall, Vito Cruz. We will message you to confirm the schedule.
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div ref={submitRef}>
        <Card>
          <CardHeader className="p-3">
            <div className="text-base font-semibold">Submit request</div>
            <div className="text-xs text-white/60">
              Admin can approve, counteroffer, or reject with a reason. You will be notified.
            </div>
          </CardHeader>
          <CardBody className="space-y-2 p-3">
            {submitMsg ? <div className="text-sm text-white/70">{submitMsg}</div> : null}
            <Button size="sm" onClick={submitRequest} disabled={!canSubmit}>
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
            {!hasItems ? (
              <div className="text-xs text-red-300">Add your item details to continue.</div>
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
