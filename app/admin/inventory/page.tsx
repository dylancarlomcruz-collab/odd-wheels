"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeTitleBrandAliases,
} from "@/lib/titleInference";
import { formatPHP } from "@/lib/money";
import { toast } from "@/components/ui/toast";

type Product = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
};

type Variant = {
  id: string;
  product_id: string;
  condition: "sealed" | "unsealed" | "with_issues";
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  cost: number | null;
  price: number;
  qty: number;
  ship_class: string | null;
  barcode: string | null;
  created_at: string;
};

type VariantCondition = Variant["condition"];
type ShipClass = "MINI_GT" | "KAIDO" | "ACRYLIC_TRUE_SCALE";
type GoogleLookupData = {
  title: string | null;
  brand: string | null;
  model: string | null;
  variation: string | null;
  images: string[];
};
type ProductUrlLookupData = GoogleLookupData & {
  source_url?: string;
};

type InventoryValuation = {
  units: number;
  cost_value: number;
  retail_value: number;
  missing_cost_variants: number;
};

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function parseValuation(raw: any): InventoryValuation | null {
  if (!raw) return null;
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  return {
    units: Math.trunc(n((data as any).units)),
    cost_value: n((data as any).cost_value),
    retail_value: n((data as any).retail_value),
    missing_cost_variants: Math.trunc(n((data as any).missing_cost_variants)),
  };
}

function formatCount(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-PH").format(num);
}

function resolveNormalizedBrand(
  current: string,
  incoming: string | null | undefined
) {
  const normalized = normalizeBrandAlias(incoming);
  if (!normalized) return current;
  if (!current.trim()) return normalized;
  if (current.trim().toLowerCase() === normalized.toLowerCase()) {
    return normalized;
  }
  return current;
}

function resolveNormalizedTitle(current: string, incoming: string | null | undefined) {
  const incomingValue = String(incoming ?? "").trim();
  if (!incomingValue) return current;
  const normalizedIncoming = normalizeTitleBrandAliases(incomingValue);
  if (!current.trim()) return normalizedIncoming;
  const normalizedCurrent = normalizeTitleBrandAliases(current);
  if (
    normalizedCurrent.toLowerCase() === normalizedIncoming.toLowerCase() &&
    current !== normalizedIncoming
  ) {
    return normalizedIncoming;
  }
  return current;
}

export default function AdminInventoryPage() {
  // Inventory valuation
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [assumeZeroCost, setAssumeZeroCost] = React.useState(true);
  const [valuationActive, setValuationActive] =
    React.useState<InventoryValuation | null>(null);
  const [valuationAll, setValuationAll] =
    React.useState<InventoryValuation | null>(null);
  const [valuationLoading, setValuationLoading] = React.useState(false);
  const [valuationError, setValuationError] = React.useState<string | null>(null);

  // Search
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null
  );
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [loadingVariants, setLoadingVariants] = React.useState(false);

  // Barcode lookup
  const [barcodeLookup, setBarcodeLookup] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupMsg, setLookupMsg] = React.useState<string | null>(null);
  const barcodeLookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoLookupRef = React.useRef("");
  const barcodeInputRef = React.useRef<HTMLInputElement | null>(null);

  // Product URL lookup
  const [productUrl, setProductUrl] = React.useState("");
  const [productUrlLoading, setProductUrlLoading] = React.useState(false);
  const [productUrlMsg, setProductUrlMsg] = React.useState<string | null>(null);
  const [productUrlResult, setProductUrlResult] =
    React.useState<ProductUrlLookupData | null>(null);
  const [productUrlSelectedImages, setProductUrlSelectedImages] = React.useState<
    Record<string, boolean>
  >({});

  // Google search lookup
  const [googleQuery, setGoogleQuery] = React.useState("");
  const [googleQueryTouched, setGoogleQueryTouched] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [googleMsg, setGoogleMsg] = React.useState<string | null>(null);
  const [googleResult, setGoogleResult] =
    React.useState<GoogleLookupData | null>(null);
  const [googleSelectedImages, setGoogleSelectedImages] = React.useState<
    Record<string, boolean>
  >({});

  // Product fields (edit)
  const [title, setTitle] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [variation, setVariation] = React.useState("");
  const [images, setImages] = React.useState<string[]>([]);
  const [selectedImages, setSelectedImages] = React.useState<
    Record<string, boolean>
  >({});

  // Manual image
  const [manualImageUrl, setManualImageUrl] = React.useState("");
  const [manualUploadLoading, setManualUploadLoading] = React.useState(false);

  // New variant fields
  const [condition, setCondition] = React.useState<VariantCondition>("unsealed");
  const [issueNotes, setIssueNotes] = React.useState("");
  const [issuePhotos, setIssuePhotos] = React.useState<string[]>([]);
  const [issuePhotosUploading, setIssuePhotosUploading] = React.useState(false);
  const [issuePhotosUploadingId, setIssuePhotosUploadingId] =
    React.useState<string | null>(null);
  const [cost, setCost] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [shipClass, setShipClass] = React.useState<ShipClass>("MINI_GT");
  const [variantBarcode, setVariantBarcode] = React.useState("");

  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!googleQueryTouched && !googleQuery.trim() && title.trim()) {
      setGoogleQuery(title.trim());
    }
  }, [googleQuery, googleQueryTouched, title]);

  React.useEffect(() => {
    void loadValuations();
  }, []);

  async function loadValuations() {
    setValuationLoading(true);
    setValuationError(null);

    const [activeRes, allRes] = await Promise.all([
      supabase.rpc("fn_admin_inventory_valuation", {
        include_archived: false,
      }),
      supabase.rpc("fn_admin_inventory_valuation", {
        include_archived: true,
      }),
    ]);

    if (activeRes.error || allRes.error) {
      const msg = [activeRes.error?.message, allRes.error?.message]
        .filter(Boolean)
        .join(" | ");
      setValuationError(msg || "Failed to load inventory valuation.");
    }

    if (!activeRes.error) {
      setValuationActive(parseValuation(activeRes.data));
    }
    if (!allRes.error) {
      setValuationAll(parseValuation(allRes.data));
    }

    setValuationLoading(false);
  }

  async function runSearch() {
    const q = search.trim();
    if (!q) return;

    const ilike = `%${q}%`;

    // Search products by identity AND variants by barcode, then merge by product id
    const [{ data: pData, error: pErr }, { data: vData, error: vErr }] =
      await Promise.all([
        supabase
          .from("products")
          .select(
            "id,title,brand,model,variation,image_urls,is_active,created_at"
          )
          .or(
            `title.ilike.${ilike},brand.ilike.${ilike},model.ilike.${ilike},variation.ilike.${ilike}`
          )
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("product_variants")
          .select(
            "product:products(id,title,brand,model,variation,image_urls,is_active,created_at)"
          )
          .ilike("barcode", ilike)
          .limit(20),
      ]);

    if (pErr) console.error(pErr);
    if (vErr) console.error(vErr);

    const merged: Product[] = [];
    const seen = new Set<string>();

    (pData as any[] | null)?.forEach((p) => {
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as any);
    });

    (vData as any[] | null)?.forEach((row) => {
      const p = row?.product;
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as any);
    });

    setResults(merged);
  }

  async function loadProduct(p: Product) {
    setSelectedProduct(p);
    setTitle(p.title ?? "");
    setBrand(p.brand ?? "");
    setModel(p.model ?? "");
    setVariation(p.variation ?? "");
    setImages(Array.isArray(p.image_urls) ? p.image_urls : []);
    setSelectedImages({});
    setLookupMsg(null);

    setLoadingVariants(true);
    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "id,product_id,condition,issue_notes,issue_photo_urls,cost,price,qty,ship_class,barcode,created_at"
      )
      .eq("product_id", p.id)
      .order("created_at", { ascending: false });

    setLoadingVariants(false);

    if (error) {
      console.error(error);
      setVariants([]);
      return;
    }
    setVariants((data as any) ?? []);
  }

  function clearProduct() {
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setModel("");
    setVariation("");
    setImages([]);
    setSelectedImages({});
    setLookupMsg(null);
    setVariants([]);
    setGoogleQuery("");
    setGoogleQueryTouched(false);
    setGoogleResult(null);
    setGoogleSelectedImages({});
    setGoogleMsg(null);
    setProductUrl("");
    setProductUrlMsg(null);
    setProductUrlResult(null);
    setProductUrlSelectedImages({});
    setBarcodeLookup("");
    setManualImageUrl("");

    // also clear variant draft
    setCondition("unsealed");
    setIssueNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    setCost("");
    setPrice("");
    setQty("1");
    setShipClass("MINI_GT");
    setVariantBarcode("");
  }

  async function lookupBarcode(override?: string) {
    const code = (override ?? barcodeLookup).trim();
    if (!code) return;

    setLookupLoading(true);
    setLookupMsg(null);

    try {
      const r = await fetch(
        `/api/barcode/lookup?barcode=${encodeURIComponent(code)}`
      );
      const j = await r.json();

      if (!j.ok) {
        setLookupMsg(j.error ?? "No barcode match.");
        return;
      }

      const d = j.data;

      // Fill product identity, but do not overwrite manual edits
      const normalizedTitle = normalizeTitleBrandAliases(
        String(d.title ?? title ?? "")
      );

      if (d.title || title) {
        setTitle((prev) => resolveNormalizedTitle(prev, normalizedTitle));
      }
      if (d.brand) {
        setBrand((prev) => resolveNormalizedBrand(prev, d.brand));
      }
      if (d.model && !model) setModel(d.model);
      if (d.color_style && !variation) setVariation(d.color_style);

      const inferred = inferFieldsFromTitle(normalizedTitle);
      if (inferred.brand) {
        setBrand((prev) => resolveNormalizedBrand(prev, inferred.brand));
      }
      if (!d.model && !model && inferred.model) setModel(inferred.model);
      if (!d.color_style && !variation && inferred.color_style)
        setVariation(inferred.color_style);

      // Fill images (select first 3 by default)
      const imgs = (d.images ?? []).filter(Boolean);
      if (imgs.length) {
        setImages(imgs);
        const map: Record<string, boolean> = {};
        imgs.slice(0, 3).forEach((u: string) => (map[u] = true));
        setSelectedImages(map);
      }

      // ✅ IMPORTANT: barcode lookup should prefill Variant Barcode so it gets saved.
      // Barcode belongs to product_variants, not products.
      if (!variantBarcode.trim()) setVariantBarcode(code);

      setLookupMsg(
        "Barcode lookup success. Review details and confirm images before saving."
      );
    } catch (e: any) {
      setLookupMsg(e?.message ?? "Lookup failed.");
    } finally {
      setLookupLoading(false);
    }
  }

  React.useEffect(() => {
    return () => {
      if (barcodeLookupTimerRef.current) {
        clearTimeout(barcodeLookupTimerRef.current);
      }
    };
  }, []);

  function focusBarcodeInput() {
    requestAnimationFrame(() => {
      barcodeInputRef.current?.focus();
    });
  }

  function scheduleBarcodeLookup(nextValue: string) {
    const code = nextValue.trim();
    if (!code || code.length < 6 || lookupLoading) return;
    if (code === lastAutoLookupRef.current) return;
    if (barcodeLookupTimerRef.current) {
      clearTimeout(barcodeLookupTimerRef.current);
    }
    barcodeLookupTimerRef.current = setTimeout(() => {
      if (lookupLoading) return;
      if (code === lastAutoLookupRef.current) return;
      lastAutoLookupRef.current = code;
      setBarcodeLookup(code);
      lookupBarcode(code);
    }, 200);
  }

  function applyLookupResult(
    result: GoogleLookupData,
    options?: { selected?: Record<string, boolean>; applyImages?: boolean }
  ) {
    const normalizedTitle = normalizeTitleBrandAliases(
      String(result.title ?? "")
    );
    if (normalizedTitle) {
      setTitle((prev) => resolveNormalizedTitle(prev, normalizedTitle));
    }
    if (result.brand) {
      setBrand((prev) => resolveNormalizedBrand(prev, result.brand));
    }
    if (result.model) setModel((prev) => (prev ? prev : result.model!));
    if (result.variation)
      setVariation((prev) => (prev ? prev : result.variation!));

    if (options?.applyImages === false) return;

    const resultImages = Array.isArray(result.images)
      ? result.images.filter(Boolean)
      : [];
    if (!resultImages.length) return;

    const selected = options?.selected;
    const toAdd = selected
      ? resultImages.filter((u) => selected[u])
      : resultImages;

    if (!toAdd.length) return;

    setImages((prev) => uniq([...prev, ...toAdd]));
    setSelectedImages((prev) => {
      const next = { ...prev };
      toAdd.slice(0, 3).forEach((u) => {
        next[u] = true;
      });
      return next;
    });
  }

  async function lookupGoogle() {
    const q = googleQuery.trim() || title.trim();
    if (!q) return;

    setGoogleLoading(true);
    setGoogleMsg(null);

    try {
      const r = await fetch(`/api/google/lookup?q=${encodeURIComponent(q)}`);
      const j = await r.json();

      if (!j.ok) {
        setGoogleMsg(j.error ?? "Google lookup failed.");
        setGoogleResult(null);
        setGoogleSelectedImages({});
        return;
      }

      const d = j.data as GoogleLookupData;
      const normalizedTitle = normalizeTitleBrandAliases(String(d.title ?? ""));
      const normalizedBrand = normalizeBrandAlias(d.brand) ?? d.brand;
      const imgs = Array.isArray(d.images)
        ? d.images.filter(Boolean).slice(0, 9)
        : [];
      const map: Record<string, boolean> = {};
      imgs.forEach((u) => {
        map[u] = true;
      });

      const normalizedResult: GoogleLookupData = {
        ...d,
        title: normalizedTitle || d.title,
        brand: normalizedBrand ?? d.brand,
        images: imgs,
      };

      setGoogleResult(normalizedResult);
      setGoogleSelectedImages(map);

      applyLookupResult(normalizedResult, { applyImages: false });

      setGoogleMsg(
        "Google search success. Review details and confirm images before saving."
      );
    } catch (e: any) {
      setGoogleMsg(e?.message ?? "Lookup failed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function lookupProductUrl() {
    const url = productUrl.trim();
    if (!url) return;

    setProductUrlLoading(true);
    setProductUrlMsg(null);

    try {
      const r = await fetch(
        `/api/product-url/lookup?url=${encodeURIComponent(url)}`
      );
      const j = await r.json();

      if (!j.ok) {
        setProductUrlMsg(j.error ?? "URL lookup failed.");
        setProductUrlResult(null);
        setProductUrlSelectedImages({});
        return;
      }

      const d = j.data as ProductUrlLookupData;
      const rawTitle = String(d.title ?? "").trim();
      const normalizedTitle = normalizeTitleBrandAliases(rawTitle);
      const normalizedBrand = normalizeBrandAlias(d.brand) ?? d.brand;
      const imgs = Array.isArray(d.images)
        ? d.images.filter(Boolean).slice(0, 9)
        : [];
      const inferred = inferFieldsFromTitle(normalizedTitle || rawTitle);
      const normalizedResult: ProductUrlLookupData = {
        ...d,
        title: normalizedTitle || d.title,
        brand: normalizedBrand ?? d.brand ?? inferred.brand ?? null,
        model: d.model ?? inferred.model ?? null,
        variation: d.variation ?? inferred.color_style ?? null,
        images: imgs,
        source_url: d.source_url ?? url,
      };
      const map: Record<string, boolean> = {};
      imgs.forEach((u) => {
        map[u] = true;
      });

      setProductUrlResult(normalizedResult);
      setProductUrlSelectedImages(map);

      applyLookupResult(normalizedResult, { applyImages: false });

      setProductUrlMsg(
        "URL lookup success. Review details and confirm images before saving."
      );
    } catch (e: any) {
      setProductUrlMsg(e?.message ?? "Lookup failed.");
    } finally {
      setProductUrlLoading(false);
    }
  }

  async function uploadFileToStorage(file: File, folderId: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("productId", folderId);

    const r = await fetch("/api/images/upload", {
      method: "POST",
      body: form,
    });
    const j = await r.json();
    if (!j.ok || !j.publicUrl) throw new Error(j.error ?? "Upload failed");
    return j.publicUrl as string;
  }

  async function uploadImageFile(
    file: File,
    productIdForPath: string,
    options?: { skipLoading?: boolean }
  ) {
    if (!options?.skipLoading) setManualUploadLoading(true);
    try {
      const url = await uploadFileToStorage(file, productIdForPath);
      setImages((prev) => uniq([...prev, url]));
      setSelectedImages((prev) => ({ ...prev, [url]: true }));
    } finally {
      if (!options?.skipLoading) setManualUploadLoading(false);
    }
  }

  async function uploadImageFiles(files: File[], productIdForPath: string) {
    if (!files.length) return;
    setManualUploadLoading(true);
    try {
      for (const file of files) {
        try {
          await uploadImageFile(file, productIdForPath, { skipLoading: true });
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
    } finally {
      setManualUploadLoading(false);
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
    const pid = selectedProduct?.id ?? crypto.randomUUID();
    void uploadImageFiles(files, pid);
  }

  async function uploadIssueFiles(files: File[], folderId: string) {
    if (!files.length) return;
    setIssuePhotosUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadFileToStorage(file, folderId);
          uploaded.push(url);
        } catch (e) {
          console.error("Issue photo upload failed", e);
        }
      }
      if (uploaded.length) {
        setIssuePhotos((prev) => uniq([...prev, ...uploaded]));
      }
    } finally {
      setIssuePhotosUploading(false);
    }
  }

  function handleIssuePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
    void uploadIssueFiles(files, folderId);
  }

  function removeIssuePhoto(url: string) {
    setIssuePhotos((prev) => prev.filter((u) => u !== url));
  }

  async function uploadVariantIssueFiles(v: Variant, files: File[]) {
    if (!files.length) return;
    setIssuePhotosUploadingId(v.id);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadFileToStorage(file, `issue-${v.id}`);
          uploaded.push(url);
        } catch (e) {
          console.error("Issue photo upload failed", e);
        }
      }
      if (!uploaded.length) return;
      const next = uniq([...(v.issue_photo_urls ?? []), ...uploaded]);
      await updateVariant(v, { issue_photo_urls: next });
    } finally {
      setIssuePhotosUploadingId(null);
    }
  }

  function handleVariantIssuePaste(v: Variant, e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    void uploadVariantIssueFiles(v, files);
  }

  async function removeVariantIssuePhoto(v: Variant, url: string) {
    const next = (v.issue_photo_urls ?? []).filter((u) => u !== url);
    await updateVariant(v, { issue_photo_urls: next.length ? next : null });
  }

  function addManualUrl() {
    const u = manualImageUrl.trim();
    if (!u) return;
    setImages((prev) => uniq([...prev, u]));
    setSelectedImages((prev) => ({ ...prev, [u]: true }));
    setManualImageUrl("");
  }

  function stepNewQty(delta: number) {
    setQty((prev) => {
      const current = Math.trunc(n(prev));
      const next = Math.max(0, current + delta);
      return String(next);
    });
  }

  function stepExistingQty(v: Variant, delta: number) {
    const current = Math.trunc(n(v.qty));
    const next = Math.max(0, current + delta);
    updateVariant(v, { qty: next });
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

  async function importSelectedImages(productId: string) {
    const selected = images.filter((u) => selectedImages[u]);

    const kept: string[] = [];

    for (const url of selected) {
      // Already hosted in Supabase Storage
      if (url.includes("/storage/v1/object/public/")) {
        kept.push(url);
        continue;
      }

      const r = await fetch("/api/images/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: url, productId }),
      });
      const j = await r.json();
      if (j.ok && j.publicUrl) kept.push(j.publicUrl);
    }

    // If import failed, still keep original selected URLs
    return kept.length ? kept : selected;
  }

  async function saveProductOnly() {
    if (!selectedProduct) {
      toast({ intent: "error", message: "Select a product first." });
      return;
    }

    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from("products")
        .update({
          title,
          brand: brand || null,
          model: model || null,
          variation: variation || null,
        })
        .eq("id", selectedProduct.id);

      if (uErr) throw uErr;

      const hasSelected = Object.values(selectedImages).some(Boolean);
      if (hasSelected) {
        const imported = await importSelectedImages(selectedProduct.id);
        const { error: imgErr } = await supabase
          .from("products")
          .update({ image_urls: imported })
          .eq("id", selectedProduct.id);
        if (imgErr) throw imgErr;
      }

      const { data, error } = await supabase
        .from("products")
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at"
        )
        .eq("id", selectedProduct.id)
        .single();

      if (error) throw error;
      if (data) await loadProduct(data as any);

      toast({ intent: "success", message: "Product updated." });
      focusBarcodeInput();
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(active: boolean) {
    if (!selectedProduct) return;

    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from("products")
        .update({ is_active: active })
        .eq("id", selectedProduct.id);
      if (uErr) throw uErr;

      const { data, error } = await supabase
        .from("products")
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at"
        )
        .eq("id", selectedProduct.id)
        .single();

      if (error) throw error;
      if (data) await loadProduct(data as any);
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function saveNewVariant() {
    setSaving(true);

    try {
      if (!title.trim()) throw new Error("Title is required.");
      if (!cost || !price || !qty)
        throw new Error("Cost, Selling Price, and Quantity are required.");

      const costN = n(cost);
      const priceN = n(price);
      const qtyN = Math.trunc(n(qty));

      if (!Number.isFinite(costN) || !Number.isFinite(priceN))
        throw new Error("Cost/Price must be valid numbers.");
      if (!Number.isFinite(qtyN))
        throw new Error("Qty must be a valid number.");
      if (qtyN < 0) throw new Error("Qty cannot be negative.");
      if (condition === "with_issues" && !issueNotes.trim()) {
        throw new Error("Issue description is required for 'With Issues'.");
      }

      // Create product if none selected
      let productId = selectedProduct?.id;

      if (!productId) {
        const { data: p, error: pErr } = await supabase
          .from("products")
          .insert({
            title,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            image_urls: [],
            is_active: true,
          })
          .select("*")
          .single();

        if (pErr) throw pErr;
        const createdProductId = String(p.id);
        productId = createdProductId;

        const hasSelected = Object.values(selectedImages).some(Boolean);
        if (hasSelected) {
          const imported = await importSelectedImages(createdProductId);
          const { error: imgErr } = await supabase
            .from("products")
            .update({ image_urls: imported })
            .eq("id", createdProductId);
          if (imgErr) throw imgErr;
        }
      } else {
        // Update identity fields when adding a new variant to existing product
        const { error: uErr } = await supabase
          .from("products")
          .update({
            title,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
          })
          .eq("id", productId);
        if (uErr) throw uErr;
      }

      const { error: vErr } = await supabase.from("product_variants").insert({
        product_id: productId!,
        condition,
        issue_notes: condition === "with_issues" ? issueNotes.trim() : null,
        issue_photo_urls:
          condition === "with_issues" && issuePhotos.length
            ? issuePhotos
            : null,
        cost: costN,
        price: priceN,
        qty: qtyN,
        ship_class: shipClass,
        barcode: variantBarcode.trim() || null,
      });

      if (vErr) throw vErr;

      toast({ intent: "success", message: "Saved product + variant." });

      // Reset draft fields
      setCondition("unsealed");
      setIssueNotes("");
      setIssuePhotos([]);
      setCost("");
      setPrice("");
      setQty("1");
      setShipClass("MINI_GT");
      setVariantBarcode("");

      clearProduct();
      focusBarcodeInput();
      return;
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function updateVariant(v: Variant, patch: Partial<Variant>) {
    const { error } = await supabase
      .from("product_variants")
      .update(patch)
      .eq("id", v.id);

    if (error) {
      toast({ intent: "error", message: error.message });
      return;
    }
    if (selectedProduct) await loadProduct(selectedProduct);
  }

  async function deleteVariant(v: Variant) {
    if (
      !confirm("Delete this variant? (Only do this if it has no sales history)")
    )
      return;

    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", v.id);

    if (error) toast({ intent: "error", message: error.message });
    if (selectedProduct) await loadProduct(selectedProduct);
  }

  const emptyValuation: InventoryValuation = {
    units: 0,
    cost_value: 0,
    retail_value: 0,
    missing_cost_variants: 0,
  };
  const activeValuation = valuationActive ?? emptyValuation;
  const allValuation = valuationAll ?? emptyValuation;
  const primaryValuation = includeArchived ? allValuation : activeValuation;
  const primaryMissing = primaryValuation.missing_cost_variants;
  const showUnknownCost = !assumeZeroCost && primaryMissing > 0;
  const costValueLabel = showUnknownCost
    ? "N/A"
    : formatPHP(primaryValuation.cost_value);
  const retailValueLabel = formatPHP(primaryValuation.retail_value);
  const profitValueLabel = showUnknownCost
    ? "N/A"
    : formatPHP(primaryValuation.retail_value - primaryValuation.cost_value);
  const activeCostLabel =
    !assumeZeroCost && activeValuation.missing_cost_variants > 0
      ? "N/A"
      : formatPHP(activeValuation.cost_value);
  const allCostLabel =
    !assumeZeroCost && allValuation.missing_cost_variants > 0
      ? "N/A"
      : formatPHP(allValuation.cost_value);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Inventory</div>
          <div className="text-sm text-white/60">
            Search, edit product identity, manage variants
            (qty/price/cost/barcode), and archive products.
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Inventory worth */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Inventory Worth</div>
                <div className="text-xs text-white/60">
                  Scope: {includeArchived ? "All inventory (active + archived)" : "Active products only"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={includeArchived}
                  onChange={setIncludeArchived}
                  label="Include archived"
                />
                <Checkbox
                  checked={assumeZeroCost}
                  onChange={setAssumeZeroCost}
                  label="Missing cost = 0"
                />
                <Button
                  variant="ghost"
                  onClick={loadValuations}
                  disabled={valuationLoading}
                >
                  {valuationLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            {valuationError ? (
              <div className="text-sm text-red-200">{valuationError}</div>
            ) : null}
            {!valuationActive && !valuationAll && valuationLoading ? (
              <div className="text-sm text-white/60">Loading valuation...</div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Units in stock</div>
                <div className="text-lg font-semibold">
                  {formatCount(primaryValuation.units)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Cost basis</div>
                <div className="text-lg font-semibold">{costValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Retail value</div>
                <div className="text-lg font-semibold">{retailValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Potential profit</div>
                <div className="text-lg font-semibold">{profitValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Missing cost variants</div>
                <div className="text-lg font-semibold">
                  {formatCount(primaryMissing)}
                </div>
              </div>
            </div>

            {showUnknownCost ? (
              <div className="text-xs text-yellow-200">
                Missing cost for {formatCount(primaryMissing)} variants. Enable
                "Missing cost = 0" to estimate cost and profit.
              </div>
            ) : null}

            <div className="text-xs text-white/50 space-y-1">
              <div>
                Active: {formatCount(activeValuation.units)} units | Cost{" "}
                {activeCostLabel} | Retail{" "}
                {formatPHP(activeValuation.retail_value)} | Missing cost{" "}
                {formatCount(activeValuation.missing_cost_variants)}
              </div>
              <div>
                All: {formatCount(allValuation.units)} units | Cost {allCostLabel}{" "}
                | Retail {formatPHP(allValuation.retail_value)} | Missing cost{" "}
                {formatCount(allValuation.missing_cost_variants)}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Search products</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search title/brand/model/variation... (or barcode)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={runSearch}>
                Search
              </Button>
              <Button variant="ghost" onClick={clearProduct}>
                New
              </Button>
            </div>

            {results.length ? (
              <div className="grid gap-2">
                {results.map((p) => {
                  const img =
                    Array.isArray(p.image_urls) && p.image_urls.length
                      ? p.image_urls[0]
                      : null;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => loadProduct(p)}
                      className="text-left rounded-xl border border-white/10 bg-paper/5 hover:bg-paper/10 px-3 py-2 flex gap-3"
                    >
                      <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={p.title}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center justify-between gap-3">
                          <span className="truncate">{p.title}</span>
                          <span
                            className={
                              p.is_active
                                ? "text-accent-700 dark:text-accent-200 text-xs"
                                : "text-red-300 text-xs"
                            }
                          >
                            {p.is_active ? "ACTIVE" : "ARCHIVED"}
                          </span>
                        </div>
                        <div className="text-xs text-white/60">
                          {p.brand ?? "—"} {p.model ? `• ${p.model}` : ""}{" "}
                          {p.variation ? `• ${p.variation}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-white/50">
                Search then select a product to edit, or click “New”.
              </div>
            )}
          </div>

          {/* Barcode lookup */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">
              Barcode Lookup (for identity + images)
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Scan or enter barcode..."
                  value={barcodeLookup}
                  autoFocus
                  ref={barcodeInputRef}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBarcodeLookup(next);
                    scheduleBarcodeLookup(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupBarcode();
                    }
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={lookupBarcode}
                disabled={lookupLoading}
              >
                {lookupLoading ? "Looking up..." : "Lookup"}
              </Button>
            </div>

            {lookupMsg ? (
              <div className="text-sm text-white/70">{lookupMsg}</div>
            ) : null}
          </div>

          {/* Product URL lookup */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Item URL Lookup</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Paste product URL..."
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupProductUrl();
                    }
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={lookupProductUrl}
                disabled={productUrlLoading}
              >
                {productUrlLoading ? "Looking up..." : "Lookup URL"}
              </Button>
            </div>

            {productUrlMsg ? (
              <div className="text-sm text-white/70">{productUrlMsg}</div>
            ) : null}

            {productUrlResult ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Suggested Title"
                    value={productUrlResult.title ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Brand"
                    value={productUrlResult.brand ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Model"
                    value={productUrlResult.model ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Variation"
                    value={productUrlResult.variation ?? ""}
                    readOnly
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="Source URL"
                      value={productUrlResult.source_url ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {productUrlResult.images?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {productUrlResult.images.slice(0, 9).map((u) => (
                      <div
                        key={u}
                        className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-40 w-full object-cover" />
                        <div className="p-3">
                          <Checkbox
                            checked={!!productUrlSelectedImages[u]}
                            onChange={(v) =>
                              setProductUrlSelectedImages((m) => ({
                                ...m,
                                [u]: v,
                              }))
                            }
                            label="Include image"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">
                    No images found for this URL.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                      productUrlResult &&
                      applyLookupResult(productUrlResult, {
                        selected: productUrlSelectedImages,
                      })
                    }
                    disabled={productUrlLoading || !productUrlResult}
                  >
                    Use result
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Google search lookup */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Google Search Lookup</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search by title, model, or barcode..."
                  value={googleQuery}
                  onChange={(e) => {
                    setGoogleQueryTouched(true);
                    setGoogleQuery(e.target.value);
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={lookupGoogle}
                disabled={googleLoading}
              >
                {googleLoading ? "Searching..." : "Search Google"}
              </Button>
            </div>

            {googleMsg ? (
              <div className="text-sm text-white/70">{googleMsg}</div>
            ) : null}

            {googleResult ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Suggested Title"
                    value={googleResult.title ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Brand"
                    value={googleResult.brand ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Model"
                    value={googleResult.model ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Variation"
                    value={googleResult.variation ?? ""}
                    readOnly
                  />
                </div>

                {googleResult.images?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {googleResult.images.slice(0, 9).map((u) => (
                      <div
                        key={u}
                        className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-40 w-full object-cover" />
                        <div className="p-3">
                          <Checkbox
                            checked={!!googleSelectedImages[u]}
                            onChange={(v) =>
                              setGoogleSelectedImages((m) => ({ ...m, [u]: v }))
                            }
                            label="Include image"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">
                    No images found for this query.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                      googleResult &&
                      applyLookupResult(googleResult, {
                        selected: googleSelectedImages,
                      })
                    }
                    disabled={googleLoading || !googleResult}
                  >
                    Use result
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Product identity */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Product Identity</div>
              {selectedProduct ? (
                <Badge>{selectedProduct.id.slice(0, 8)}</Badge>
              ) : (
                <Badge>NEW</Badge>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                label="Diecast Brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
              <Input
                label="Car Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <Input
                label="Color / Style (Variation)"
                value={variation}
                onChange={(e) => setVariation(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={saveProductOnly}
                disabled={!selectedProduct || saving}
              >
                Save Product Changes
              </Button>

              {selectedProduct ? (
                selectedProduct.is_active ? (
                  <Button
                    variant="ghost"
                    onClick={() => toggleArchive(false)}
                    disabled={saving}
                  >
                    Archive (hide from shop)
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => toggleArchive(true)}
                    disabled={saving}
                  >
                    Unarchive
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {/* Images */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Images</div>
              <Badge>Confirm before saving</Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input
                  label="Add image URL (optional)"
                  placeholder="https://..."
                  value={manualImageUrl}
                  onChange={(e) => setManualImageUrl(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={addManualUrl}
                  disabled={!manualImageUrl.trim()}
                >
                  Add URL
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <div className="text-sm font-medium mb-2">
                Upload image file (optional)
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const pid = selectedProduct?.id ?? crypto.randomUUID();
                  uploadImageFile(f, pid);
                }}
              />
              <div className="mt-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const pid = selectedProduct?.id ?? crypto.randomUUID();
                    uploadImageFile(f, pid);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="text-xs text-white/50 mt-1">Take photo</div>
              </div>
              {manualUploadLoading ? (
                <div className="text-xs text-white/60 mt-1">Uploading...</div>
              ) : null}
              <div className="text-xs text-white/50 mt-1">
                Requires bucket:{" "}
                <code className="text-white/70">product-images</code>
              </div>
            </div>

            <div
              className="rounded-xl border border-dashed border-white/15 bg-bg-900/40 p-3 text-sm text-white/60"
              tabIndex={0}
              onClick={(e) => (e.currentTarget as HTMLDivElement).focus()}
              onPaste={handleImagePaste}
            >
              Paste image here (click box, then press Ctrl+V).
            </div>

            {images.length === 0 ? (
              <div className="text-sm text-white/50">No images yet.</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {images.slice(0, 9).map((u, idx) => (
                    <div
                      key={u}
                      draggable
                      className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
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
                      <img src={u} alt="" className="h-40 w-full object-cover" />
                      <div className="p-3">
                        <Checkbox
                          checked={!!selectedImages[u]}
                          onChange={(v) =>
                            setSelectedImages((m) => ({ ...m, [u]: v }))
                          }
                          label="Use this image"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-white/50">
                  Drag images to reorder.
                </div>
              </>
            )}
          </div>

          {/* Variants list (edit) */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Existing Variants</div>
              <Badge>{variants.length}</Badge>
            </div>

            {loadingVariants ? (
              <div className="text-white/60">Loading variants…</div>
            ) : variants.length === 0 ? (
              <div className="text-white/60">
                No variants yet for this product.
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-white/10 bg-paper/5 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        {v.condition.toUpperCase()}{" "}
                        {v.issue_notes ? (
                          <span className="text-white/50">
                            • {v.issue_notes}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/50">
                        Variant #{v.id.slice(0, 8)}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-6">
                      <Input
                        label="Barcode"
                        value={v.barcode ?? ""}
                        onChange={(e) =>
                          updateVariant(v, { barcode: e.target.value || null })
                        }
                      />
                      <Input
                        label="Cost"
                        value={String(v.cost ?? "")}
                        onChange={(e) =>
                          updateVariant(v, {
                            cost: e.target.value ? n(e.target.value) : null,
                          })
                        }
                      />
                      <Input
                        label="Price"
                        value={String(v.price ?? "")}
                        onChange={(e) =>
                          updateVariant(v, { price: n(e.target.value) })
                        }
                      />
                      <div className="space-y-1">
                        <div className="text-sm text-white/80">Qty</div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            type="button"
                            className="h-10 w-10 px-0"
                            onClick={() => stepExistingQty(v, -1)}
                            aria-label="Decrease quantity"
                          >
                            -
                          </Button>
                          <div className="flex-1">
                            <Input
                              value={String(v.qty ?? 0)}
                              onChange={(e) =>
                                updateVariant(v, {
                                  qty: Math.max(
                                    0,
                                    Math.trunc(n(e.target.value))
                                  ),
                                })
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            type="button"
                            className="h-10 w-10 px-0"
                            onClick={() => stepExistingQty(v, 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      <Select
                        label="Ship Class"
                        value={v.ship_class ?? ""}
                        onChange={(e) =>
                          updateVariant(v, {
                            ship_class: e.target.value || null,
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="MINI_GT">MINI_GT</option>
                        <option value="KAIDO">KAIDO</option>
                        <option value="ACRYLIC_TRUE_SCALE">
                          ACRYLIC_TRUE_SCALE
                        </option>
                      </Select>

                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          onClick={() => deleteVariant(v)}
                        >
                          Delete
                        </Button>
                      </div>

                      {v.condition === "with_issues" ? (
                        <div className="md:col-span-6 space-y-3">
                          <Textarea
                            label="Issue Notes"
                            value={v.issue_notes ?? ""}
                            onChange={(e) =>
                              updateVariant(v, {
                                issue_notes: e.target.value || null,
                              })
                            }
                          />

                          <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                            <div className="text-sm font-medium">
                              Issue Photos (optional)
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => {
                                const list = Array.from(e.target.files ?? []);
                                if (!list.length) return;
                                void uploadVariantIssueFiles(v, list);
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
                                void uploadVariantIssueFiles(v, [f]);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div
                              className="rounded-lg border border-dashed border-white/15 bg-bg-900/40 p-2 text-xs text-white/60"
                              tabIndex={0}
                              onClick={(e) =>
                                (e.currentTarget as HTMLDivElement).focus()
                              }
                              onPaste={(e) => handleVariantIssuePaste(v, e)}
                            >
                              Paste issue photo here (click box, then press Ctrl+V).
                            </div>
                            {issuePhotosUploadingId === v.id ? (
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
                                    <img
                                      src={u}
                                      alt=""
                                      className="h-32 w-full object-cover"
                                    />
                                    <div className="p-2">
                                      <Button
                                        variant="ghost"
                                        type="button"
                                        onClick={() => removeVariantIssuePhoto(v, u)}
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

          {/* Add new variant */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="font-semibold">Add New Variant (Condition)</div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Condition"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as VariantCondition)
                }
              >
                <option value="sealed">Sealed</option>
                <option value="unsealed">Unsealed</option>
                <option value="with_issues">With Issues</option>
              </Select>

              <Select
                label="Shipping Class"
                value={shipClass}
                onChange={(e) => setShipClass(e.target.value as ShipClass)}
              >
                <option value="MINI_GT">Mini GT</option>
                <option value="KAIDO">Kaido</option>
                <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
              </Select>

              <Input
                label="Variant Barcode (optional)"
                value={variantBarcode}
                onChange={(e) => setVariantBarcode(e.target.value)}
              />
              <div />

              <Input
                label="Cost (₱)"
                value={cost}
                onChange={(e) =>
                  setCost(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="(empty)"
              />
              <Input
                label="Selling Price (₱)"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="(empty)"
              />
              <div className="space-y-1">
                <div className="text-sm text-white/80">Quantity</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    className="h-10 w-10 px-0"
                    onClick={() => stepNewQty(-1)}
                    aria-label="Decrease quantity"
                  >
                    -
                  </Button>
                  <div className="flex-1">
                    <Input
                      value={qty}
                      onChange={(e) =>
                        setQty(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="(empty)"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    type="button"
                    className="h-10 w-10 px-0"
                    onClick={() => stepNewQty(1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </Button>
                </div>
              </div>

              {condition === "with_issues" ? (
                <div className="space-y-3 md:col-span-2">
                  <Textarea
                    label="Issue Description (Required)"
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                  />

                  <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                    <div className="text-sm font-medium">
                      Issue Photos (optional)
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        if (!list.length) return;
                        const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
                        void uploadIssueFiles(list, folderId);
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
                        const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
                        void uploadIssueFiles([f], folderId);
                        e.currentTarget.value = "";
                      }}
                    />
                    <div
                      className="rounded-lg border border-dashed border-white/15 bg-bg-900/40 p-2 text-xs text-white/60"
                      tabIndex={0}
                      onClick={(e) =>
                        (e.currentTarget as HTMLDivElement).focus()
                      }
                      onPaste={handleIssuePaste}
                    >
                      Paste issue photo here (click box, then press Ctrl+V).
                    </div>
                    {issuePhotosUploading ? (
                      <div className="text-xs text-white/60">
                        Uploading...
                      </div>
                    ) : null}

                    {issuePhotos.length ? (
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {issuePhotos.map((u) => (
                          <div
                            key={u}
                            className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt=""
                              className="h-32 w-full object-cover"
                            />
                            <div className="p-2">
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => removeIssuePhoto(u)}
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
              ) : (
                <div className="text-sm text-white/50 md:col-span-2">
                  Issue description is required only for "With Issues".
                </div>
              )}
            </div>

            <Button onClick={saveNewVariant} disabled={saving}>
              {saving ? "Saving..." : "Save Variant"}
            </Button>

            <div className="text-xs text-white/50">
              Cost/Price are empty by default. Qty defaults to 1.
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

