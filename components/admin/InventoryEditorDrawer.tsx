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

type LastSoldEntry = {
  orderId: string;
  variantId: string;
  condition: string;
};

const CONDITION_OPTIONS: Array<VariantDraft["condition"]> = [
  "sealed",
  "resealed",
  "near_mint",
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
  "TRUCKS",
  "BLISTER",
  "TOMICA",
  "HOT_WHEELS_MAINLINE",
  "HOT_WHEELS_PREMIUM",
  "LOOSE_NO_BOX",
  "LALAMOVE",
  "FIGURES_DIORAMA",
];
const COURIER_OPTIONS = [
  { value: "LBC", label: "LBC" },
  { value: "JNT", label: "J&T" },
  { value: "LALAMOVE", label: "Lalamove" },
  { value: "PICKUP", label: "Pickup" },
];
const LBC_PACKAGE_OPTIONS = [
  { value: "N_SAKTO", label: "N-Sakto" },
  { value: "MINIBOX", label: "MiniBox" },
  { value: "SMALL_BOX", label: "Small Box" },
];
const JNT_POUCH_OPTIONS = [
  { value: "SMALL", label: "Small pouch" },
  { value: "MEDIUM", label: "Medium pouch" },
];

function safeNumber(v: any): number | null {
  if (v === "" || v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRestrictionList(values?: Array<string | null | undefined> | null) {
  const cleaned = (values ?? [])
    .map((value) => String(value ?? "").trim().toUpperCase())
    .filter(Boolean);
  return cleaned.length ? Array.from(new Set(cleaned)) : null;
}

function normalizeShipClass(value?: string | null) {
  const cleaned = String(value ?? "").trim().toUpperCase();
  return cleaned ? cleaned : null;
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
  const [quickThumbUploading, setQuickThumbUploading] = React.useState(false);
  const [issueUploadId, setIssueUploadId] = React.useState<string | null>(null);
  const [isActive, setIsActive] = React.useState(true);
  const [variants, setVariants] = React.useState<VariantDraft[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [selling, setSelling] = React.useState(false);
  const [revertingSale, setRevertingSale] = React.useState(false);
  const [lastSoldEntry, setLastSoldEntry] = React.useState<LastSoldEntry | null>(
    null
  );
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
  const quickThumbInputRef = React.useRef<HTMLInputElement | null>(null);
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        public_notes: v.public_notes ?? v.issue_notes ?? null,
        allowed_couriers: Array.isArray(v.allowed_couriers) ? v.allowed_couriers : [],
        allowed_lbc_packages: Array.isArray(v.allowed_lbc_packages)
          ? v.allowed_lbc_packages
          : [],
        allowed_jnt_pouches: Array.isArray(v.allowed_jnt_pouches)
          ? v.allowed_jnt_pouches
          : [],
        _isNew: false,
        _delete: false,
      }))
    );
    setNewImage("");
    setCropEditor(null);
    setLastSoldEntry(null);
  }, [product]);

  if (!product) return null;

  const productId = product.id;

  async function uploadImageFileRaw(
    file: File,
    productIdForPath: string
  ): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("productId", productIdForPath);

    const r = await fetch("/api/images/upload", {
      method: "POST",
      body: form,
    });
    const j = await r.json();
    if (!j.ok || !j.publicUrl) throw new Error(j.error ?? "Upload failed");
    return j.publicUrl as string;
  }

  async function uploadImageFile(file: File, productIdForPath: string) {
    return await uploadImageFileRaw(file, productIdForPath);
  }

  async function uploadImageFiles(files: File[], productIdForPath: string) {
    if (!files.length) return;
    setUploadingImages(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadImageFile(file, productIdForPath);
          uploaded.push(url);
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
      if (uploaded.length) {
        setImages((prev) => Array.from(new Set([...uploaded, ...prev])));
      }
    } finally {
      setUploadingImages(false);
    }
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = (
      items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[]
    );
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
      crop: parsed.crop ?? { zoom: 1, x: 0, y: 0, rotate: 0 },
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

  function toggleVariantRestriction(
    variant: VariantDraft,
    field:
      | "allowed_couriers"
      | "allowed_lbc_packages"
      | "allowed_jnt_pouches",
    value: string,
    checked: boolean
  ) {
    const current = Array.isArray(variant[field]) ? variant[field] : [];
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((item) => item !== value);
    updateVariant(variant.id, { [field]: next } as Partial<VariantDraft>);
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

  function resolveOrderId(data: any): string | null {
    if (!data) return null;
    if (typeof data === "string" || typeof data === "number") return String(data);
    if (typeof data === "object") {
      return (
        data.order_id ??
        data.orderId ??
        data.id ??
        data.order?.id ??
        data.data?.id ??
        null
      );
    }
    return null;
  }

  async function markOneSoldViaPos() {
    if (selling || saving || deletingProduct) return;

    const available = variants
      .filter((v) => !v._delete)
      .filter((v) => Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0)) > 0)
      .slice()
      .sort(
        (a, b) =>
          conditionSortOrder(a.condition) - conditionSortOrder(b.condition) ||
          Number(a.price ?? 0) - Number(b.price ?? 0)
      );

    if (!available.length) {
      toast({ intent: "error", message: "No stock available to mark sold." });
      return;
    }

    const target = available[0];

    setSelling(true);
    try {
      const shippingDetails = {
        method: "PICKUP",
        text: "Auto-sold from inventory editor",
        discount: null,
      };
      const items = [{ variant_id: target.id, qty: 1 }];

      const { data, error } = await supabase.rpc("pos_create_order", {
        p_customer_name: "Odd Wheels FB",
        p_customer_phone: "N/A",
        p_shipping_method: "PICKUP",
        p_shipping_details: shippingDetails,
        p_payment_method: "CASH",
        p_save_customer: false,
        p_items: items,
      });

      if (error) throw error;

      const orderId = resolveOrderId(data);
      if (!orderId) {
        throw new Error("POS order created, but order id is missing.");
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        throw new Error("Staff session not found. Please sign in again.");
      }

      const res = await fetch("/api/pos/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "POS completion failed.");
      }

      setLastSoldEntry({
        orderId,
        variantId: target.id,
        condition: target.condition,
      });
      setVariants((prev) =>
        prev.map((v) => {
          if (v.id !== target.id) return v;
          const currentQty = Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0));
          return { ...v, qty: Math.max(0, currentQty - 1) };
        })
      );
      onSaved();
      toast({
        intent: "success",
        title: "Marked sold",
        message: `1 qty sold via POS as Odd Wheels FB (${formatConditionLabel(target.condition, {
          upper: true,
        })}).`,
      });
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Sell failed",
        message: e?.message ?? "Unable to mark item as sold.",
      });
    } finally {
      setSelling(false);
    }
  }

  async function revertLastSoldViaPos() {
    if (!lastSoldEntry || selling || saving || deletingProduct || revertingSale) return;
    const confirmed = window.confirm("Revert the last sold item for this product?");
    if (!confirmed) return;

    setRevertingSale(true);
    try {
      const { error } = await supabase.rpc("fn_staff_void_order", {
        p_order_id: lastSoldEntry.orderId,
        p_reason: "Reverted sale from inventory editor",
      });
      if (error) throw error;

      setVariants((prev) =>
        prev.map((v) => {
          if (v.id !== lastSoldEntry.variantId) return v;
          const currentQty = Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0));
          return { ...v, qty: currentQty + 1 };
        })
      );
      onSaved();
      toast({
        intent: "success",
        title: "Sale reverted",
        message: `Last sale reverted (${formatConditionLabel(lastSoldEntry.condition, {
          upper: true,
        })}).`,
      });
      setLastSoldEntry(null);
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Revert failed",
        message: e?.message ?? "Unable to revert last sale.",
      });
    } finally {
      setRevertingSale(false);
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
      hasSealed && hasUnsealed
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
    const baseShipClass =
      (base?.ship_class as string | null) ?? shipClassFromBrand(brand);
    const nextShipClass = isBlisterCondition(nextCondition)
      ? "BLISTER"
      : baseShipClass;
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
        issue_notes: null,
        public_notes: base?.public_notes ?? base?.issue_notes ?? null,
        issue_photo_urls: Array.isArray(base?.issue_photo_urls)
          ? [...(base?.issue_photo_urls ?? [])]
          : [],
        allowed_couriers: Array.isArray(base?.allowed_couriers)
          ? [...(base?.allowed_couriers ?? [])]
          : [],
        allowed_lbc_packages: Array.isArray(base?.allowed_lbc_packages)
          ? [...(base?.allowed_lbc_packages ?? [])]
          : [],
        allowed_jnt_pouches: Array.isArray(base?.allowed_jnt_pouches)
          ? [...(base?.allowed_jnt_pouches ?? [])]
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

  async function save(options?: { imagesOverride?: string[]; closeAfter?: boolean }) {
    if (!title.trim()) {
      toast({ intent: "error", message: "Title is required." });
      return;
    }
    setSaving(true);

    try {
      const imagesToSave = options?.imagesOverride ?? images;
        const { error: productError } = await supabase
          .from("products")
          .update({
            title,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            image_urls: imagesToSave,
            is_active: isActive,
            created_at: new Date().toISOString(),
          })
          .eq("id", productId);

        if (productError) throw productError;

      const existing = variants.filter((v) => !v._isNew && !v._delete);
      const toDelete = variants.filter((v) => v._delete && !v._isNew);
      const toInsert = variants.filter((v) => v._isNew && !v._delete);

        if (existing.length) {
          await Promise.all(
            existing.map(async (v) => {
              const { data, error } = await supabase
                .from("product_variants")
                .update({
                  condition: v.condition,
                  barcode: v.barcode || null,
                  cost: safeNumber(v.cost),
                  price: safeNumber(v.price) ?? 0,
                  qty: Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0)),
                  ship_class: normalizeShipClass(v.ship_class),
                  allowed_couriers: normalizeRestrictionList(v.allowed_couriers),
                  allowed_lbc_packages: normalizeRestrictionList(v.allowed_lbc_packages),
                  allowed_jnt_pouches: normalizeRestrictionList(v.allowed_jnt_pouches),
                  public_notes:
                    v.condition === "near_mint"
                      ? v.public_notes || "Near Mint Condition"
                      : v.public_notes || null,
                  issue_notes: null,
                  issue_photo_urls:
                    v.condition === "with_issues"
                      ? (v.issue_photo_urls?.length ? v.issue_photo_urls : null)
                      : null,
                })
                .eq("id", v.id)
                .select("id");

              if (error) throw error;
              if (!data || data.length === 0) {
                throw new Error(
                  `Variant update blocked for ${v.id}. Check staff permissions or ship class constraints.`
                );
              }
              return data;
            })
          );
        }

        if (toDelete.length) {
          const { error: deleteError } = await supabase
            .from("product_variants")
            .delete()
            .in(
              "id",
              toDelete.map((v) => v.id)
            );

          if (deleteError) throw deleteError;
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
              ship_class: normalizeShipClass(v.ship_class),
              allowed_couriers: normalizeRestrictionList(v.allowed_couriers),
              allowed_lbc_packages: normalizeRestrictionList(v.allowed_lbc_packages),
              allowed_jnt_pouches: normalizeRestrictionList(v.allowed_jnt_pouches),
            public_notes:
              v.condition === "near_mint"
                ? v.public_notes || "Near Mint Condition"
                : v.public_notes || null,
            issue_notes: null,
            issue_photo_urls:
              v.condition === "with_issues"
                ? (v.issue_photo_urls?.length ? v.issue_photo_urls : null)
                : null,
          });
        }

          const { error: insertError } = await supabase
            .from("product_variants")
            .insert(prepared);

          if (insertError) throw insertError;

        for (const entry of generated) {
          await recordGeneratedBarcode(entry.barcode, entry.condition);
        }
      }

      toast({ intent: "success", title: "Saved", message: "Inventory updated." });
      onSaved();
      if (options?.closeAfter ?? true) onClose();
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

  async function saveProductImages(imagesToSave: string[]) {
    const { error } = await supabase
      .from("products")
      .update({
        image_urls: imagesToSave,
        created_at: new Date().toISOString(),
      })
      .eq("id", productId);
    if (error) throw error;
  }

  async function handleQuickThumbUpload(files: File[]) {
    if (!files.length) return;
    setQuickThumbUploading(true);
    if (mountedRef.current) {
      onClose();
    }
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadImageFileRaw(file, productId);
          uploaded.push(url);
        } catch (e) {
          console.error("Thumbnail upload failed", e);
        }
      }
      if (!uploaded.length) {
        throw new Error("No images were uploaded.");
      }
      const nextImages = Array.from(
        new Set([...uploaded, ...images.filter((u) => !uploaded.includes(u))])
      );
      if (mountedRef.current) {
        setImages(nextImages);
      }
      await saveProductImages(nextImages);
      onSaved();
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Upload failed",
        message: e?.message ?? "Unable to upload thumbnail.",
      });
    } finally {
      if (mountedRef.current) {
        setQuickThumbUploading(false);
      }
    }
  }

  async function pickImageFilesFromLibrary(options?: { multiple?: boolean }) {
    const picker = (window as any)?.showOpenFilePicker;
    if (typeof picker !== "function") return null as File[] | null;
    try {
      const handles = await picker({
        multiple: options?.multiple ?? true,
        types: [
          {
            description: "Images",
            accept: {
              "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"],
            },
          },
        ],
        excludeAcceptAllOption: false,
        startIn: "pictures",
      });
      const files = await Promise.all(
        (handles as Array<{ getFile: () => Promise<File> }>).map((handle) =>
          handle.getFile()
        )
      );
      return files.filter(Boolean);
    } catch (e: any) {
      if (e?.name === "AbortError") return [] as File[];
      throw e;
    }
  }

  async function openQuickThumbPicker() {
    try {
      const picked = await pickImageFilesFromLibrary({ multiple: true });
      if (Array.isArray(picked)) {
        if (picked.length) {
          await handleQuickThumbUpload(picked);
        }
        return;
      }
      quickThumbInputRef.current?.click();
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Picker unavailable",
        message: e?.message ?? "Unable to open photo library.",
      });
      quickThumbInputRef.current?.click();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-full sm:max-w-4xl overflow-y-auto bg-bg-900 border-l border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-white/10 bg-bg-900/90 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-semibold">{product.title}</div>
              <div className="text-sm text-white/60">Edit product and variants</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Checkbox
                checked={isActive}
                onChange={setIsActive}
                label="Active in shop"
              />
              <div className="hidden sm:flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={markOneSoldViaPos}
                  disabled={saving || deletingProduct || selling}
                >
                  {selling ? "Selling..." : "Sold (Odd Wheels FB)"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={revertLastSoldViaPos}
                  disabled={
                    saving ||
                    deletingProduct ||
                    selling ||
                    revertingSale ||
                    !lastSoldEntry
                  }
                >
                  {revertingSale ? "Reverting..." : "Revert last sold"}
                </Button>
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
                <Button onClick={() => save()} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-4 pb-28 pt-4 sm:p-6 sm:pb-6">
          <div className="rounded-2xl border border-white/10 bg-bg-900/50 p-4 space-y-3 sm:hidden">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Thumbnail</div>
              {images.length ? <Badge>Primary</Badge> : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-lg border border-white/10 bg-bg-800/60 overflow-hidden flex-shrink-0">
                {(() => {
                  if (!images[0]) {
                    return (
                      <div className="h-full w-full grid place-items-center text-[10px] text-white/50">
                        No image
                      </div>
                    );
                  }
                  const preview = parseImageCrop(images[0]);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.src}
                      alt=""
                      className="h-full w-full object-contain bg-white"
                      style={cropStyle(preview.crop)}
                    />
                  );
                })()}
              </div>
              <div className="flex-1">
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={quickThumbUploading || saving}
                  onClick={() => {
                    void openQuickThumbPicker();
                  }}
                >
                  {quickThumbUploading ? "Uploading..." : "Upload thumbnail"}
                </Button>
                <div className="mt-2 text-xs text-white/60">
                  Closes immediately and uploads in background so you can edit the next item.
                </div>
              </div>
            </div>
            <input
              ref={quickThumbInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (!list.length) return;
                void handleQuickThumbUpload(list);
                e.currentTarget.value = "";
              }}
            />
          </div>

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
              <div className="text-sm font-medium">Upload image files</div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  if (!list.length) return;
                  void uploadImageFiles(list, productId);
                  e.currentTarget.value = "";
                }}
              />
              <div className="text-xs text-white/50">
                Mobile opens your photo library.
              </div>
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
                                const nextNotes =
                                  nextCondition === "near_mint"
                                    ? v.public_notes || "Near Mint Condition"
                                    : v.condition === "near_mint" &&
                                        v.public_notes === "Near Mint Condition"
                                      ? null
                                      : v.public_notes ?? null;
                                const nextShipClass =
                                  isBlisterCondition(nextCondition)
                                    ? "BLISTER"
                                    : v.ship_class === "BLISTER"
                                      ? shipClassFromBrand(brand)
                                      : v.ship_class;
                                updateVariant(v.id, {
                                  condition: nextCondition,
                                  ship_class: nextShipClass ?? null,
                                  public_notes: nextNotes,
                                  issue_notes: null,
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
                          label="Class"
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
                        <div className="md:col-span-3 rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                          <div className="text-sm font-medium">
                            Shipping Restrictions (optional)
                          </div>
                          <div className="text-xs text-white/60">
                            Limit this variant to specific couriers or container types.
                            Leave empty to allow all.
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-white/70">
                                Couriers
                              </div>
                              <div className="space-y-1">
                                {COURIER_OPTIONS.map((opt) => (
                                  <Checkbox
                                    key={`${v.id}-courier-${opt.value}`}
                                    checked={Boolean(
                                      v.allowed_couriers?.includes(opt.value)
                                    )}
                                    onChange={(checked) =>
                                      toggleVariantRestriction(
                                        v,
                                        "allowed_couriers",
                                        opt.value,
                                        checked
                                      )
                                    }
                                    label={opt.label}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-white/70">
                                LBC packages
                              </div>
                              <div className="space-y-1">
                                {LBC_PACKAGE_OPTIONS.map((opt) => (
                                  <Checkbox
                                    key={`${v.id}-lbc-${opt.value}`}
                                    checked={Boolean(
                                      v.allowed_lbc_packages?.includes(opt.value)
                                    )}
                                    onChange={(checked) =>
                                      toggleVariantRestriction(
                                        v,
                                        "allowed_lbc_packages",
                                        opt.value,
                                        checked
                                      )
                                    }
                                    label={opt.label}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-white/70">
                                J&T pouches
                              </div>
                              <div className="space-y-1">
                                {JNT_POUCH_OPTIONS.map((opt) => (
                                  <Checkbox
                                    key={`${v.id}-jnt-${opt.value}`}
                                    checked={Boolean(
                                      v.allowed_jnt_pouches?.includes(opt.value)
                                    )}
                                    onChange={(checked) =>
                                      toggleVariantRestriction(
                                        v,
                                        "allowed_jnt_pouches",
                                        opt.value,
                                        checked
                                      )
                                    }
                                    label={opt.label}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Textarea
                          label="Notes (visible to customers)"
                          value={v.public_notes ?? v.issue_notes ?? ""}
                          onChange={(e) =>
                            updateVariant(v.id, {
                              public_notes: e.target.value || null,
                              issue_notes: null,
                            })
                          }
                          className="md:col-span-3"
                        />
                        {v.condition === "with_issues" ? (
                          <div className="md:col-span-3 space-y-3">
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
                              <div className="text-xs text-white/50">
                                Mobile opens your photo library.
                              </div>
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

        <div className="sticky bottom-0 z-10 border-t border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:hidden">
          <div className="grid gap-2">
            <Button
              variant="secondary"
              onClick={markOneSoldViaPos}
              disabled={saving || deletingProduct || selling}
            >
              {selling ? "Selling..." : "Sold (Odd Wheels FB)"}
            </Button>
            <Button
              variant="ghost"
              onClick={revertLastSoldViaPos}
              disabled={
                saving || deletingProduct || selling || revertingSale || !lastSoldEntry
              }
            >
              {revertingSale ? "Reverting..." : "Revert last sold"}
            </Button>
            <Button
              variant="danger"
              onClick={deleteProduct}
              disabled={saving || deletingProduct}
            >
              {deletingProduct ? "Deleting..." : "Delete"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => save()} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {cropEditor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-0 py-0 sm:px-4 sm:py-6">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCropEditor(null)}
              aria-label="Close crop editor"
            />
            <div className="relative w-full h-full sm:h-auto sm:max-w-2xl overflow-y-auto rounded-none sm:rounded-2xl border border-white/10 bg-bg-900/95 p-4 sm:p-5 shadow-soft">
              <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 border-b border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
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
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-4">
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
                  <div className="md:hidden space-y-2">
                    <div className="text-xs text-white/60">Card preview</div>
                    <div className="rounded-[22px] border border-amber-300/30 bg-[#0f1016] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
                      <div className="text-center text-[10px] font-extrabold tracking-[0.24em] text-amber-300/90 uppercase mb-2">
                        {String(brand || "Brand").toUpperCase()}
                      </div>
                      <div className="rounded-2xl border border-white/30 bg-[#fffdf8] overflow-hidden">
                        <div className="relative aspect-[4/3] w-full overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cropEditor.baseUrl}
                            alt="Card preview"
                            className="h-full w-full object-contain bg-white"
                            style={cropStyle(cropEditor.crop)}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-white/80 line-clamp-2">
                        {title || "Product title"}
                      </div>
                    </div>
                  </div>
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
                      className="mt-2 w-full accent-amber-400"
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
                      className="mt-2 w-full accent-amber-400"
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
                      className="mt-2 w-full accent-amber-400"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCropEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                crop: normalizeCrop({
                                  ...prev.crop,
                                  rotate: (prev.crop.rotate ?? 0) - 90,
                                }),
                              }
                            : prev
                        )
                      }
                    >
                      Rotate Left
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCropEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                crop: normalizeCrop({
                                  ...prev.crop,
                                  rotate: (prev.crop.rotate ?? 0) + 90,
                                }),
                              }
                            : prev
                        )
                      }
                    >
                      Rotate Right
                    </Button>
                    <div className="text-xs text-white/60">
                      {(cropEditor.crop.rotate ?? 0) % 360}°
                    </div>
                  </div>

                  <div className="hidden md:block space-y-2 pt-2">
                    <div className="text-xs text-white/60">Card preview</div>
                    <div className="rounded-[22px] border border-amber-300/30 bg-[#0f1016] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
                      <div className="text-center text-[10px] font-extrabold tracking-[0.24em] text-amber-300/90 uppercase mb-2">
                        {String(brand || "Brand").toUpperCase()}
                      </div>
                      <div className="rounded-2xl border border-white/30 bg-[#fffdf8] overflow-hidden">
                        <div className="relative aspect-[4/3] w-full overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cropEditor.baseUrl}
                            alt="Card preview"
                            className="h-full w-full object-contain bg-white"
                            style={cropStyle(cropEditor.crop)}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-white/80 line-clamp-2">
                        {title || "Product title"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 hidden sm:flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setCropEditor((prev) =>
                      prev
                        ? { ...prev, crop: { zoom: 1, x: 0, y: 0, rotate: 0 } }
                        : prev
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

              <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:hidden">
                <div className="grid gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: { zoom: 1, x: 0, y: 0, rotate: 0 },
                            }
                          : prev
                      )
                    }
                  >
                    Reset
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
