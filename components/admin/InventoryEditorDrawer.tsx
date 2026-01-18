"use client";

import * as React from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/lib/supabase/browser";
import { toast } from "@/components/ui/toast";
import { shipClassFromBrand } from "@/lib/shipping/shipClass";
import type { AdminProduct, AdminVariant } from "./InventoryBrowseGrid";

type VariantDraft = AdminVariant & {
  _isNew?: boolean;
  _delete?: boolean;
};

type InventoryEditorDrawerProps = {
  product: AdminProduct | null;
  onClose: () => void;
  onSaved: () => void;
};

const CONDITION_OPTIONS: Array<VariantDraft["condition"]> = [
  "sealed",
  "unsealed",
  "with_issues",
];

const SHIP_OPTIONS = ["MINI_GT", "KAIDO", "POPRACE", "ACRYLIC_TRUE_SCALE"];

function safeNumber(v: any): number | null {
  if (v === "" || v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function InventoryEditorDrawer({
  product,
  onClose,
  onSaved,
}: InventoryEditorDrawerProps) {
  const [title, setTitle] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [variation, setVariation] = React.useState("");
  const [images, setImages] = React.useState<string[]>([]);
  const [newImage, setNewImage] = React.useState("");
  const [uploadingImages, setUploadingImages] = React.useState(false);
  const [issueUploadId, setIssueUploadId] = React.useState<string | null>(null);
  const [isActive, setIsActive] = React.useState(true);
  const [variants, setVariants] = React.useState<VariantDraft[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!product) return;
    setTitle(product.title ?? "");
    setBrand(product.brand ?? "");
    setModel(product.model ?? "");
    setVariation(product.variation ?? "");
    setImages(Array.isArray(product.image_urls) ? product.image_urls : []);
    setIsActive(product.is_active);
    // Keep a local copy so inline edits do not mutate list until save.
    setVariants(
      (product.product_variants ?? []).map((v) => ({
        ...v,
        issue_photo_urls: Array.isArray(v.issue_photo_urls) ? v.issue_photo_urls : [],
        _isNew: false,
        _delete: false,
      }))
    );
    setNewImage("");
  }, [product]);

  if (!product) return null;

  const productId = product.id;

  async function uploadImageFile(
    file: File,
    productIdForPath: string,
    options?: { skipLoading?: boolean }
  ) {
    if (!options?.skipLoading) setUploadingImages(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("productId", productIdForPath);

      const r = await fetch("/api/images/upload", {
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (!j.ok || !j.publicUrl) throw new Error(j.error ?? "Upload failed");

      const url = j.publicUrl as string;
      setImages((prev) => Array.from(new Set([...prev, url])));
    } finally {
      if (!options?.skipLoading) setUploadingImages(false);
    }
  }

  async function uploadImageFiles(files: File[], productIdForPath: string) {
    if (!files.length) return;
    setUploadingImages(true);
    try {
      for (const file of files) {
        try {
          await uploadImageFile(file, productIdForPath, { skipLoading: true });
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
    } finally {
      setUploadingImages(false);
    }
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    void uploadImageFiles(files, productId);
  }

  function addImage() {
    const url = newImage.trim();
    if (!url) return;
    addImageUrls([url]);
    setNewImage("");
  }

  function addImageUrls(urls: string[]) {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleaned.length) return;
    setImages((prev) => Array.from(new Set([...prev, ...cleaned])));
  }

  function handleNewImagePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const urls = text
      .split(/\s+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) return;
    e.preventDefault();
    addImageUrls(urls);
    setNewImage("");
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function uploadIssueFiles(v: VariantDraft, files: File[]) {
    if (!files.length) return;
    setIssueUploadId(v.id);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("productId", `issue-${v.id}`);

          const r = await fetch("/api/images/upload", {
            method: "POST",
            body: form,
          });
          const j = await r.json();
          if (!j.ok || !j.publicUrl) throw new Error(j.error ?? "Upload failed");

          uploaded.push(j.publicUrl as string);
        } catch (e) {
          console.error("Issue photo upload failed", e);
        }
      }
      if (!uploaded.length) return;
      updateVariant(v.id, {
        issue_photo_urls: Array.from(
          new Set([...(v.issue_photo_urls ?? []), ...uploaded])
        ),
      });
    } finally {
      setIssueUploadId(null);
    }
  }

  function handleIssuePaste(v: VariantDraft, e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    void uploadIssueFiles(v, files);
  }

  function removeIssuePhoto(v: VariantDraft, url: string) {
    const next = (v.issue_photo_urls ?? []).filter((u) => u !== url);
    updateVariant(v.id, { issue_photo_urls: next });
  }

  function stepVariantQty(v: VariantDraft, delta: number) {
    const current = Math.trunc(safeNumber(v.qty) ?? 0);
    const next = Math.max(0, current + delta);
    updateVariant(v.id, { qty: next });
  }

  function reorderImages(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleImageDrop(e: React.DragEvent, targetIndex: number) {
    const raw = e.dataTransfer.getData("text/plain");
    const fromIndex = Number(raw);
    if (!Number.isFinite(fromIndex)) return;
    reorderImages(fromIndex, targetIndex);
  }

  function updateVariant(id: string, patch: Partial<VariantDraft>) {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v))
    );
  }

  function addVariant() {
    const baseList = variants.filter((v) => !v._delete && !v._isNew);
    const base = [...baseList].reverse().find((v) => v) ?? null;
    const hasSealed = baseList.some((v) => v.condition === "sealed");
    const hasUnsealed = baseList.some((v) => v.condition === "unsealed");
    const nextCondition: VariantDraft["condition"] =
      hasSealed && hasUnsealed
        ? "with_issues"
        : hasSealed
          ? "unsealed"
          : hasUnsealed
            ? "sealed"
            : "unsealed";
    const nextShipClass = shipClassFromBrand(brand);
    setVariants((prev) => [
        ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        condition: nextCondition,
        barcode: base?.barcode ?? null,
        cost: base?.cost ?? null,
        price: 0,
        qty: base?.qty ?? 1,
        ship_class: nextShipClass ?? null,
        issue_notes: base?.issue_notes ?? null,
        public_notes: base?.public_notes ?? null,
        issue_photo_urls: Array.isArray(base?.issue_photo_urls)
          ? [...(base?.issue_photo_urls ?? [])]
          : [],
        created_at: null,
        _isNew: true,
        _delete: false,
      },
    ]);
  }

  function generateBarcodeCandidate() {
    const stamp = Date.now().toString();
    const rand = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    return (stamp + rand).slice(-12);
  }

  async function generateUniqueBarcode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateBarcodeCandidate();
      const { data, error } = await supabase
        .from("product_variants")
        .select("id")
        .eq("barcode", candidate)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return candidate;
    }
    throw new Error("Unable to generate a unique barcode.");
  }

  async function recordGeneratedBarcode(barcode: string, condition: string) {
    const detail = [brand, model, variation].filter(Boolean).join(" ");
    const conditionLabel = condition
      ? `Condition: ${condition.toUpperCase()}`
      : "";
    const description = [detail, conditionLabel].filter(Boolean).join(" • ");

    const { error } = await supabase.from("barcode_logs").insert({
      product_id: productId,
      product_title: title.trim() || null,
      description: description || null,
      barcode,
    });

    if (error) {
      console.error("Failed to record barcode log:", error);
    }
  }

  async function save() {
    if (!title.trim()) {
      toast({ intent: "error", message: "Title is required." });
      return;
    }
    setSaving(true);

    try {
      await supabase
        .from("products")
        .update({
          title,
          brand: brand || null,
          model: model || null,
          variation: variation || null,
          image_urls: images,
          is_active: isActive,
        })
        .eq("id", productId);

      const existing = variants.filter((v) => !v._isNew && !v._delete);
      const toDelete = variants.filter((v) => v._delete && !v._isNew);
      const toInsert = variants.filter((v) => v._isNew && !v._delete);

      if (existing.length) {
        await Promise.all(
          existing.map((v) =>
            supabase
              .from("product_variants")
              .update({
                condition: v.condition,
                barcode: v.barcode || null,
                cost: safeNumber(v.cost),
                price: safeNumber(v.price) ?? 0,
                qty: Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0)),
                ship_class: v.ship_class || null,
                public_notes: v.public_notes || null,
                issue_notes:
                  v.condition === "with_issues"
                    ? v.issue_notes || null
                    : null,
                issue_photo_urls:
                  v.condition === "with_issues"
                    ? (v.issue_photo_urls?.length ? v.issue_photo_urls : null)
                    : null,
              })
              .eq("id", v.id)
          )
        );
      }

      if (toDelete.length) {
        await supabase
          .from("product_variants")
          .delete()
          .in(
            "id",
            toDelete.map((v) => v.id)
          );
      }

      if (toInsert.length) {
        const prepared: Array<any> = [];
        const generated: Array<{ barcode: string; condition: string }> = [];

        for (const v of toInsert) {
          let barcode = v.barcode || null;
          if (!barcode) {
            barcode = await generateUniqueBarcode();
            generated.push({ barcode, condition: v.condition });
          }
          prepared.push({
            product_id: productId,
            condition: v.condition,
            barcode,
            cost: safeNumber(v.cost),
            price: safeNumber(v.price) ?? 0,
            qty: Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0)),
            ship_class: v.ship_class || null,
            public_notes: v.public_notes || null,
            issue_notes:
              v.condition === "with_issues" ? v.issue_notes || null : null,
            issue_photo_urls:
              v.condition === "with_issues"
                ? (v.issue_photo_urls?.length ? v.issue_photo_urls : null)
                : null,
          });
        }

        await supabase.from("product_variants").insert(prepared);

        for (const entry of generated) {
          await recordGeneratedBarcode(entry.barcode, entry.condition);
        }
      }

      toast({ intent: "success", title: "Saved", message: "Inventory updated." });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Save failed",
        message: e?.message ?? "Unable to save changes.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-4xl overflow-y-auto bg-bg-900 border-l border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-bg-900/90 px-6 py-4 backdrop-blur">
          <div>
            <div className="text-lg font-semibold">{product.title}</div>
            <div className="text-sm text-white/60">Edit product and variants</div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isActive}
              onChange={setIsActive}
              label="Active in shop"
            />
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-2xl border border-white/10 bg-bg-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Product identity</div>
              <Badge>{productId.slice(0, 8)}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
              <Input label="Variation" value={variation} onChange={(e) => setVariation(e.target.value)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Images</div>
              <Badge>{images.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Add image URL..."
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                onPaste={handleNewImagePaste}
              />
              <Button variant="secondary" onClick={addImage} disabled={!newImage.trim()}>
                Add
              </Button>
            </div>
            <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-2">
              <div className="text-sm font-medium">Upload image file</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void uploadImageFile(f, productId);
                  e.currentTarget.value = "";
                }}
              />
              <div className="text-xs text-white/50">Take photo</div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void uploadImageFile(f, productId);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {uploadingImages ? (
              <div className="text-xs text-white/60">Uploading...</div>
            ) : null}
            <div
              className="rounded-xl border border-dashed border-white/15 bg-bg-900/40 p-3 text-sm text-white/60"
              tabIndex={0}
              onClick={(e) => (e.currentTarget as HTMLDivElement).focus()}
              onPaste={handleImagePaste}
            >
              Paste image here (click box, then press Ctrl+V).
            </div>
            {images.length ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {images.map((u, idx) => (
                    <div
                      key={u}
                      draggable
                      className="rounded-xl border border-white/10 bg-bg-800/60 overflow-hidden"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleImageDrop(e, idx);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-32 w-full object-cover" />
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-white/70">
                        <span className="truncate">{u}</span>
                        <Button variant="ghost" onClick={() => removeImage(u)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-white/50">
                  Drag images to reorder.
                </div>
              </>
            ) : (
              <div className="text-sm text-white/60">No images yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Variants</div>
              <Button variant="secondary" onClick={addVariant}>
                Add variant
              </Button>
            </div>

            {!variants.filter((v) => !v._delete).length ? (
              <div className="text-sm text-white/60">No variants yet.</div>
            ) : (
              <div className="space-y-3">
                {variants
                  .filter((v) => !v._delete)
                  .map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-white/10 bg-paper/5 p-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge>{v._isNew ? "NEW" : v.id.slice(0, 8)}</Badge>
                          <Select
                            value={v.condition}
                            onChange={(e) =>
                              updateVariant(v.id, {
                                condition: e.target.value as VariantDraft["condition"],
                              })
                            }
                          >
                            {CONDITION_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt.toUpperCase()}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button variant="ghost" onClick={() => updateVariant(v.id, { _delete: true })}>
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          label="Barcode"
                          value={v.barcode ?? ""}
                          onChange={(e) => updateVariant(v.id, { barcode: e.target.value || null })}
                        />
                        <Input
                          label="Cost"
                          type="number"
                          value={v.cost ?? ""}
                          onChange={(e) => updateVariant(v.id, { cost: safeNumber(e.target.value) })}
                        />
                        <Input
                          label="Price"
                          type="number"
                          value={v.price ?? ""}
                          onChange={(e) => updateVariant(v.id, { price: safeNumber(e.target.value) })}
                        />
                        <div className="space-y-1">
                          <div className="text-sm text-white/80">Quantity</div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              type="button"
                              className="h-10 w-10 px-0"
                              onClick={() => stepVariantQty(v, -1)}
                              aria-label="Decrease quantity"
                            >
                              -
                            </Button>
                            <div className="flex-1">
                              <Input
                                type="number"
                                value={v.qty ?? 0}
                                onChange={(e) =>
                                  updateVariant(v.id, {
                                    qty: Math.max(
                                      0,
                                      Math.trunc(safeNumber(e.target.value) ?? 0)
                                    ),
                                  })
                                }
                              />
                            </div>
                            <Button
                              variant="ghost"
                              type="button"
                              className="h-10 w-10 px-0"
                              onClick={() => stepVariantQty(v, 1)}
                              aria-label="Increase quantity"
                            >
                              +
                            </Button>
                          </div>
                        </div>
                        <Select
                          label="Ship class"
                          value={v.ship_class ?? ""}
                          onChange={(e) =>
                            updateVariant(v.id, { ship_class: e.target.value || null })
                          }
                        >
                          <option value="">(none)</option>
                          {SHIP_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                        <Textarea
                          label="Notes (visible to customers)"
                          value={v.public_notes ?? ""}
                          onChange={(e) =>
                            updateVariant(v.id, { public_notes: e.target.value || null })
                          }
                          className="md:col-span-3"
                        />
                        {v.condition === "with_issues" ? (
                          <div className="md:col-span-3 space-y-3">
                            <Textarea
                              label="Issue notes"
                              value={v.issue_notes ?? ""}
                              onChange={(e) =>
                                updateVariant(v.id, { issue_notes: e.target.value || null })
                              }
                            />

                            <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                              <div className="text-sm font-medium">Issue photos</div>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => {
                                  const list = Array.from(e.target.files ?? []);
                                  if (!list.length) return;
                                  void uploadIssueFiles(v, list);
                                  e.currentTarget.value = "";
                                }}
                              />
                              <div className="text-xs text-white/50">Take photo</div>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  void uploadIssueFiles(v, [f]);
                                  e.currentTarget.value = "";
                                }}
                              />
                              <div
                                className="rounded-lg border border-dashed border-white/15 bg-bg-900/40 p-2 text-xs text-white/60"
                                tabIndex={0}
                                onClick={(e) =>
                                  (e.currentTarget as HTMLDivElement).focus()
                                }
                                onPaste={(e) => handleIssuePaste(v, e)}
                              >
                                Paste issue photo here (click box, then press Ctrl+V).
                              </div>
                              {issueUploadId === v.id ? (
                                <div className="text-xs text-white/60">
                                  Uploading...
                                </div>
                              ) : null}

                              {v.issue_photo_urls?.length ? (
                                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                                  {v.issue_photo_urls.map((u) => (
                                    <div
                                      key={u}
                                      className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={u} alt="" className="h-32 w-full object-cover" />
                                      <div className="p-2">
                                        <Button
                                          variant="ghost"
                                          type="button"
                                          onClick={() => removeIssuePhoto(v, u)}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-white/50">
                                  No issue photos yet.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
