"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InventoryBrowseGrid } from "@/components/admin/InventoryBrowseGrid";
import { InventoryEditorDrawer } from "@/components/admin/InventoryEditorDrawer";
import type { AdminProduct } from "@/components/admin/InventoryBrowseGrid";

export default function AdminInventoryBrowsePage() {
  const searchParams = useSearchParams();
  const [selected, setSelected] = React.useState<AdminProduct | null>(null);
  const [prefillError, setPrefillError] = React.useState<string | null>(null);
  const editProductId = React.useMemo(
    () => String(searchParams.get("editProduct") ?? "").trim(),
    [searchParams]
  );

  React.useEffect(() => {
    if (!editProductId) return;
    let active = true;
    setPrefillError(null);
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at,product_variants(id,condition,barcode,cost,price,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,issue_notes,issue_photo_urls,public_notes,created_at)"
        )
        .eq("id", editProductId)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setPrefillError(error.message || "Failed to open product editor.");
        return;
      }
      if (!data) {
        setPrefillError("Product not found for this editor link.");
        return;
      }
      setSelected(data as AdminProduct);
    })();
    return () => {
      active = false;
    };
  }, [editProductId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Inventory Browse</div>
          <div className="text-sm text-white/60">
            Browse inventory visually like the shop grid. Click a card to edit
            product identity, images, variants, pricing, and sold out status.
          </div>
        </CardHeader>
        <CardBody>
          {prefillError ? (
            <div className="mb-3 text-sm text-red-300">{prefillError}</div>
          ) : null}
          <InventoryBrowseGrid
            onSelect={(p) => setSelected(p)}
            suspendScanCapture={Boolean(selected)}
          />
        </CardBody>
      </Card>

      <InventoryEditorDrawer
        product={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {}}
      />
    </div>
  );
}
