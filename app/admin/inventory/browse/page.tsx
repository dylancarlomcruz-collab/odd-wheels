"use client";

import * as React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InventoryBrowseGrid } from "@/components/admin/InventoryBrowseGrid";
import { InventoryEditorDrawer } from "@/components/admin/InventoryEditorDrawer";
import type { AdminProduct } from "@/components/admin/InventoryBrowseGrid";

export default function AdminInventoryBrowsePage() {
  const [selected, setSelected] = React.useState<AdminProduct | null>(null);

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
