"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";

type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export default function AdminNoticesPage() {
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [isActive, setIsActive] = React.useState(true);
  const [expiresAt, setExpiresAt] = React.useState(""); // YYYY-MM-DD

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error(error);
    setNotices((data as any) ?? []);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function add() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;

    const { error } = await supabase.from("notices").insert({
      title: t,
      body: b,
      pinned,
      is_active: isActive,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
    });
    if (error) alert(error.message);

    setTitle("");
    setBody("");
    setPinned(false);
    setIsActive(true);
    setExpiresAt("");
    await load();
  }

  async function toggleActive(n: Notice) {
    await supabase.from("notices").update({ is_active: !n.is_active }).eq("id", n.id);
    await load();
  }

  async function togglePinned(n: Notice) {
    await supabase.from("notices").update({ pinned: !n.pinned }).eq("id", n.id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("notices").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Notice Board</div>
            <div className="text-sm text-white/60">Homepage shows latest updates, shipping schedules, rules, and shop news.</div>
          </div>
          <Badge>{notices.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="font-semibold">Post new notice</div>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Expires (optional)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              <div className="flex flex-col justify-center gap-2">
                <Checkbox checked={pinned} onChange={setPinned} label="Pinned" />
                <Checkbox checked={isActive} onChange={setIsActive} label="Active (visible)" />
              </div>
            </div>
            <Button onClick={add}>Publish notice</Button>
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <div key={n.id} className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{n.title}</div>
                        {n.pinned ? (
                          <Badge className="border-accent-500/30 text-accent-700 dark:text-accent-200">
                            Pinned
                          </Badge>
                        ) : null}
                        {!n.is_active ? <Badge className="border-red-500/30 text-red-200">Hidden</Badge> : null}
                      </div>
                      <div className="mt-1 text-sm text-white/70 whitespace-pre-wrap">{n.body}</div>
                      {n.expires_at ? <div className="mt-2 text-xs text-white/50">Expires: {new Date(n.expires_at).toLocaleString("en-PH")}</div> : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="ghost" onClick={() => togglePinned(n)}>{n.pinned ? "Unpin" : "Pin"}</Button>
                      <Button variant="ghost" onClick={() => toggleActive(n)}>{n.is_active ? "Hide" : "Show"}</Button>
                      <Button variant="danger" onClick={() => remove(n.id)}>Delete</Button>
                    </div>
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
