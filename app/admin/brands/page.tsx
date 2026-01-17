"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type BrandTab = { id: string; name: string; sort_order: number; is_active: boolean };

export default function AdminBrandsPage() {
  const [brands, setBrands] = React.useState<BrandTab[]>([]);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("brand_tabs").select("*").order("sort_order", { ascending: true });
    if (error) console.error(error);
    setBrands((data as any) ?? []);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    const sort = brands.length ? Math.max(...brands.map((b) => b.sort_order)) + 1 : 1;
    const { error } = await supabase.from("brand_tabs").insert({ name: n, sort_order: sort, is_active: true });
    if (error) alert(error.message);
    setName("");
    await load();
  }

  async function toggle(b: BrandTab) {
    await supabase.from("brand_tabs").update({ is_active: !b.is_active }).eq("id", b.id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("brand_tabs").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Brand Tabs</div>
            <div className="text-sm text-white/60">Admin can add or remove tabs shown to buyers.</div>
          </div>
          <Badge>{brands.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input placeholder="New brand tab name..." value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={add}>Add</Button>
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : (
            <div className="space-y-2">
              {brands.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-900/30 p-3">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-white/50">Sort: {b.sort_order}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => toggle(b)}>{b.is_active ? "Hide" : "Show"}</Button>
                    <Button variant="danger" onClick={() => remove(b.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
