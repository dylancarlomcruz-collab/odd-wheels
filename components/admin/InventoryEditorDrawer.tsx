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

const SHIP_OPTIONS = ["MINI_GT", "KAIDO", "ACRYLIC_TRUE_SCALE"];

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
        _isNew: false,
        _delete: false,
      }))
    );
    setNewImage("");
  }, [product]);

  if (!product) return null;

  function addImage() {
    const url = newImage.trim();
    if (!url) return;
    setImages((prev) => Array.from(new Set([...prev, url])));
    setNewImage("");
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  function updateVariant(id: string, patch: Partial<VariantDraft>) {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v))
    );
  }

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        condition: "sealed",
        barcode: null,
        cost: null,
        price: 0,
        qty: 0,
        ship_class: null,
        issue_notes: null,
        created_at: null,
        _isNew: true,
        _delete: false,
      },
    ]);
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
        .eq("id", product.id);

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
                issue_notes:
                  v.condition === "with_issues"
                    ? v.issue_notes || null
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
        await supabase.from("product_variants").insert(
          toInsert.map((v) => ({
            product_id: product.id,
            condition: v.condition,
            barcode: v.barcode || null,
            cost: safeNumber(v.cost),
            price: safeNumber(v.price) ?? 0,
            qty: Math.max(0, Math.trunc(safeNumber(v.qty) ?? 0)),
            ship_class: v.ship_class || null,
            issue_notes:
              v.condition === "with_issues" ? v.issue_notes || null : null,
          }))
        );
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
              <Badge>{product.id.slice(0, 8)}</Badge>
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
              />
              <Button variant="secondary" onClick={addImage} disabled={!newImage.trim()}>
                Add
              </Button>
            </div>
            {images.length ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {images.map((u) => (
                  <div
                    key={u}
                    className="rounded-xl border border-white/10 bg-bg-800/60 overflow-hidden"
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
                        <Input
                          label="Quantity"
                          type="number"
                          value={v.qty ?? 0}
                          onChange={(e) =>
                            updateVariant(v.id, {
                              qty: Math.max(0, Math.trunc(safeNumber(e.target.value) ?? 0)),
                            })
                          }
                        />
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
                        {v.condition === "with_issues" ? (
                          <Textarea
                            label="Issue notes"
                            value={v.issue_notes ?? ""}
                            onChange={(e) =>
                              updateVariant(v.id, { issue_notes: e.target.value || null })
                            }
                            className="md:col-span-3"
                          />
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
