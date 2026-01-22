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
import {
  conditionSortOrder,
  formatConditionLabel,
  isDioramaCondition,
  isBlisterCondition,
} from "@/lib/conditions";
import {
  applyImageCrop,
  cropStyle,
  normalizeCrop,
  parseImageCrop,
  type ImageCrop,
} from "@/lib/imageCrop";
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
  "resealed",
  "near_mint",
  "diorama",
  "sealed_blister",
  "unsealed_blister",
  "blistered",
  "unsealed",
  "with_issues",
];

const SHIP_OPTIONS = [
  "MINI_GT",
  "KAIDO",
  "POPRACE",
  "ACRYLIC_TRUE_SCALE",
  "BLISTER",
  "TOMICA",
  "HOT_WHEELS_MAINLINE",
  "HOT_WHEELS_PREMIUM",
  "LOOSE_NO_BOX",
  "LALAMOVE",
];

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
  const [deletingVariantId, setDeletingVariantId] = React.useState<string | null>(
    null
  );
  const [deletingProduct, setDeletingProduct] = React.useState(false);
  const [cropEditor, setCropEditor] = React.useState<{
    index: number;
    baseUrl: string;
    crop: ImageCrop;
  } | null>(null);
  const cropFrameRef = React.useRef<HTMLDivElement | null>(null);
  const cropDragRef = React.useRef<{
    startX: number;
    startY: number;
    crop: ImageCrop;
    rect: DOMRect;
  } | null>(null);

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
    setCropEditor(null);
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

  function updateImageUrlAtIndex(index: number, nextUrl: string) {
    setImages((prev) => {
      if (!prev[index] || prev[index] === nextUrl) return prev;
      const next = [...prev];
      next[index] = nextUrl;
      return next;
    });
  }

  function openCropEditor(url: string, index: number) {
    const parsed = parseImageCrop(url);
    setCropEditor({
      index,
      baseUrl: parsed.src,
      crop: parsed.crop ?? { zoom: 1, x: 0, y: 0 },
    });
  }

  function beginCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropEditor || !cropFrameRef.current) return;
    const rect = cropFrameRef.current.getBoundingClientRect();
    cropDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      crop: cropEditor.crop,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    const { startX, startY, crop, rect } = cropDragRef.current;
    const dx = ((event.clientX - startX) / rect.width) * 100;
    const dy = ((event.clientY - startY) / rect.height) * 100;
    setCropEditor((prev) =>
      prev
        ? {
            ...prev,
            crop: normalizeCrop({
              ...crop,
              x: crop.x + dx,
              y: crop.y + dy,
            }),
          }
        : prev
    );
  }

  function endCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    cropDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
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

  async function deleteVariant(v: VariantDraft) {
    if (
      !confirm(
        "Delete this variant? This will remove it from the database."
      )
    )
      return;

    if (v._isNew) {
      setVariants((prev) => prev.filter((item) => item.id !== v.id));
      return;
    }

    setDeletingVariantId(v.id);
    try {
      const { data, error } = await supabase.rpc("fn_delete_variant", {
        p_variant_id: v.id,
        p_delete_cart_items: true,
      });

      if (error) {
        toast({ intent: "error", message: error.message });
        return;
      }

      if (!data?.ok) {
        const reason =
          data?.error === "HAS_ORDERS"
            ? "Cannot delete. This variant is linked to orders."
            : data?.error === "NOT_FOUND"
              ? "Variant not found."
              : "Delete failed.";
        toast({ intent: "error", message: reason });
        return;
      }

      setVariants((prev) => prev.filter((item) => item.id !== v.id));
      toast({ intent: "success", message: "Variant deleted." });
      onSaved();
    } finally {
      setDeletingVariantId(null);
    }
  }

  async function deleteProduct() {
    const productName = product?.title?.trim() || "this product";
    if (
      !confirm(
        `Delete "${productName}"? This removes the product and its variants.`
      )
    )
      return;

    setDeletingProduct(true);
    try {
      const { data, error } = await supabase.rpc("fn_delete_product", {
        p_product_id: productId,
        p_delete_cart_items: true,
      });

      if (error) {
        toast({ intent: "error", message: error.message });
        return;
      }

      if (!data?.ok) {
        const reason =
          data?.error === "HAS_ORDERS"
            ? "Cannot delete. This product is linked to orders."
            : data?.error === "NOT_FOUND"
              ? "Product not found."
              : "Delete failed.";
        toast({ intent: "error", message: reason });
        return;
      }

      toast({ intent: "success", message: "Product deleted." });
      onSaved();
      onClose();
    } finally {
      setDeletingProduct(false);
    }
  }

  function addVariant() {
    const baseList = variants.filter((v) => !v._delete && !v._isNew);
    const base = [...baseList].reverse().find((v) => v) ?? null;
    const hasDiorama = baseList.some((v) => v.condition === "diorama");
    const hasSealed = baseList.some((v) => v.condition === "sealed");
    const hasUnsealed = baseList.some((v) => v.condition === "unsealed");
    const hasSealedBlister = baseList.some(
      (v) => v.condition === "sealed_blister"
    );
    const hasUnsealedBlister = baseList.some(
      (v) => v.condition === "unsealed_blister"
    );
    const hasBlistered = baseList.some((v) => v.condition === "blistered");
    const nextCondition: VariantDraft["condition"] =
      hasDiorama
        ? "diorama"
        : hasSealed && hasUnsealed
          ? "with_issues"
          : hasSealed
            ? "unsealed"
            : hasUnsealed
              ? "sealed"
              : hasSealedBlister && hasUnsealedBlister
                ? "with_issues"
                : hasSealedBlister
                  ? "unsealed_blister"
                  : hasUnsealedBlister
                    ? "sealed_blister"
                    : hasBlistered
                      ? "blistered"
                      : "unsealed";
    const nextShipClass = isDioramaCondition(nextCondition)
      ? "LALAMOVE"
      : isBlisterCondition(nextCondition)
        ? "BLISTER"
        : shipClassFromBrand(brand);
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
      ? `Condition: ${formatConditionLabel(condition, { upper: true })}`
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
                ship_class: isDioramaCondition(v.condition)
                  ? "LALAMOVE"
                  : v.ship_class || null,
                public_notes: v.public_notes || null,
                issue_notes:
                  v.condition === "with_issues"
                    ? v.issue_notes || null
                    : v.condition === "near_mint"
                      ? v.issue_notes || "Near Mint Condition"
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
            ship_class: isDioramaCondition(v.condition)
              ? "LALAMOVE"
              : v.ship_class || null,
            public_notes: v.public_notes || null,
            issue_notes:
              v.condition === "with_issues"
                ? v.issue_notes || null
                : v.condition === "near_mint"
                  ? v.issue_notes || "Near Mint Condition"
                  : null,
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
            <Button
              variant="danger"
              onClick={deleteProduct}
              disabled={saving || deletingProduct}
            >
              {deletingProduct ? "Deleting..." : "Delete"}
            </Button>
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
                  {images.map((u, idx) => {
                    const preview = parseImageCrop(u);
                    return (
                      <div
                        key={`${u}-${idx}`}
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
                        <div
                          role="button"
                          tabIndex={0}
                          className="aspect-[4/3] w-full overflow-hidden bg-neutral-50 cursor-pointer"
                          onClick={() => openCropEditor(u, idx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openCropEditor(u, idx);
                            }
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview.src}
                            alt=""
                            className="h-full w-full object-contain"
                            style={cropStyle(preview.crop)}
                          />
                        </div>
                        <div className="px-3 py-2 text-xs text-white/70 space-y-2">
                          <div className="truncate">{preview.src}</div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCropEditor(u, idx)}
                            >
                              Adjust crop
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeImage(u)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                              {
                                const nextCondition = e.target
                                  .value as VariantDraft["condition"];
                                const nextIssueNotes =
                                  nextCondition === "near_mint"
                                    ? "Near Mint Condition"
                                    : v.condition === "near_mint" &&
                                        v.issue_notes === "Near Mint Condition"
                                      ? null
                                      : v.issue_notes ?? null;
                                const nextShipClass =
                                  isDioramaCondition(nextCondition)
                                    ? "LALAMOVE"
                                    : isBlisterCondition(nextCondition)
                                      ? "BLISTER"
                                      : v.ship_class === "BLISTER" ||
                                          v.ship_class === "LALAMOVE"
                                        ? shipClassFromBrand(brand)
                                        : v.ship_class;
                                updateVariant(v.id, {
                                  condition: nextCondition,
                                  ship_class: nextShipClass ?? null,
                                  issue_notes: nextIssueNotes,
                                });
                              }}
                          >
                            {CONDITION_OPTIONS
                              .slice()
                              .sort(
                                (a, b) =>
                                  conditionSortOrder(a) -
                                  conditionSortOrder(b)
                              )
                              .map((opt) => (
                                <option key={opt} value={opt}>
                                  {formatConditionLabel(opt)}
                                </option>
                              ))}
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => deleteVariant(v)}
                          disabled={saving || deletingVariantId === v.id}
                        >
                          {deletingVariantId === v.id ? "Deleting..." : "Delete"}
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

        {cropEditor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCropEditor(null)}
              aria-label="Close crop editor"
            />
            <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-white/50">Product card preview</div>
                  <div className="text-lg font-semibold">Adjust image crop</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCropEditor(null)}
                >
                  Close
                </Button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div
                  ref={cropFrameRef}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-neutral-50 cursor-move select-none touch-none"
                  onPointerDown={beginCropDrag}
                  onPointerMove={updateCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropEditor.baseUrl}
                    alt="Card preview"
                    className="h-full w-full object-contain"
                    style={cropStyle(cropEditor.crop)}
                  />
                  <div className="pointer-events-none absolute inset-0 border border-white/70 shadow-[0_0_0_9999px_rgba(255,255,255,0.6)] dark:border-white/40 dark:shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
                </div>

                <div className="space-y-4">
                  <div className="text-xs text-white/60">
                    Drag the image to position it inside the visible frame.
                  </div>
                  <div>
                    <div className="text-xs text-white/60">Zoom</div>
                    <input
                      type="range"
                      min={1}
                      max={2.5}
                      step={0.05}
                      value={cropEditor.crop.zoom}
                      onChange={(e) =>
                        setCropEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                crop: normalizeCrop({
                                  ...prev.crop,
                                  zoom: Number(e.target.value),
                                }),
                              }
                            : prev
                        )
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60">Horizontal</div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={cropEditor.crop.x}
                      onChange={(e) =>
                        setCropEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                crop: normalizeCrop({
                                  ...prev.crop,
                                  x: Number(e.target.value),
                                }),
                              }
                            : prev
                        )
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60">Vertical</div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={cropEditor.crop.y}
                      onChange={(e) =>
                        setCropEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                crop: normalizeCrop({
                                  ...prev.crop,
                                  y: Number(e.target.value),
                                }),
                              }
                            : prev
                        )
                      }
                      className="mt-2 w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setCropEditor((prev) =>
                      prev ? { ...prev, crop: { zoom: 1, x: 0, y: 0 } } : prev
                    )
                  }
                >
                  Reset
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setCropEditor(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      const nextUrl = applyImageCrop(
                        cropEditor.baseUrl,
                        cropEditor.crop
                      );
                      updateImageUrlAtIndex(cropEditor.index, nextUrl);
                      setCropEditor(null);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
