"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Announcement = {
  id: string;
  user_id: string | null;
  title: string | null;
  body: string;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
};

type MediaItem = {
  file: File;
  preview: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PH");
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const isAdmin = profile?.role === "admin";

  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const [posting, setPosting] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const loadAnnouncements = React.useCallback(
    async (includeInactive: boolean) => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("announcements")
        .select("id,user_id,title,body,image_urls,is_active,created_at")
        .order("created_at", { ascending: false })
        .limit(60);

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error: loadError } = await query;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message || "Failed to load announcements.");
        setAnnouncements([]);
        setLoading(false);
        return;
      }

      setAnnouncements((data as Announcement[]) ?? []);
      setLoading(false);
    },
    []
  );

  React.useEffect(() => {
    loadAnnouncements(Boolean(isAdmin));
  }, [isAdmin, loadAnnouncements]);

  React.useEffect(() => {
    return () => {
      media.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, [media]);

  function onAddMedia(files: FileList | null) {
    if (!files?.length) return;
    const next: MediaItem[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setMedia((prev) => [...prev, ...next]);
  }

  function removeMedia(index: number) {
    setMedia((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }

  async function uploadAnnouncementImages(uploadId: string, items: MediaItem[]) {
    const uploaded: string[] = [];
    for (const item of items) {
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("productId", `announcement-${uploadId}`);
      const res = await fetch("/api/images/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json?.publicUrl) {
        throw new Error(json?.error || "Image upload failed.");
      }
      uploaded.push(String(json.publicUrl));
    }
    return uploaded;
  }

  async function submitAnnouncement() {
    if (!isAdmin) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedBody && media.length === 0) {
      setPostError("Add a message or at least one photo before posting.");
      return;
    }

    setPosting(true);
    setPostError(null);

    try {
      const uploadId = typeof crypto !== "undefined" ? crypto.randomUUID() : Date.now().toString();
      const imageUrls = media.length ? await uploadAnnouncementImages(uploadId, media) : [];

      const { error: insertError } = await supabase.from("announcements").insert({
        user_id: user?.id ?? null,
        title: trimmedTitle || null,
        body: trimmedBody || "",
        image_urls: imageUrls,
        is_active: true,
      });

      if (insertError) throw insertError;

      setTitle("");
      setBody("");
      media.forEach((item) => URL.revokeObjectURL(item.preview));
      setMedia([]);
      await loadAnnouncements(true);
    } catch (err: any) {
      setPostError(err?.message ?? "Failed to post announcement.");
    } finally {
      setPosting(false);
    }
  }

  async function removeAnnouncement(id: string) {
    if (!isAdmin) return;
    const { error: deleteError } = await supabase.from("announcements").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message || "Failed to delete announcement.");
      return;
    }
    await loadAnnouncements(true);
  }

  const scheduleText = settings?.shipping_schedule_text?.trim();
  const cutoffText = settings?.shipping_cutoff_text?.trim();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Shipping dates</div>
          <div className="text-sm text-white/60">
            Updated by admin in settings.
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {scheduleText ? (
            <div className="text-sm text-white/80 whitespace-pre-wrap">
              {scheduleText}
            </div>
          ) : (
            <div className="text-sm text-white/50">No shipping dates set yet.</div>
          )}
          {cutoffText ? (
            <div className="text-xs text-white/50 whitespace-pre-wrap">
              Cutoff: {cutoffText}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <div className="text-xl font-semibold">Post announcement</div>
            <div className="text-sm text-white/60">
              Share updates with photos and text.
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
            />
            <Textarea
              label="Message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement..."
            />
            <label className="block text-sm text-white/80">
              Photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="mt-2 block w-full rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-xs text-white/80"
                onChange={(e) => onAddMedia(e.target.files)}
              />
            </label>
            {media.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {media.map((item, index) => (
                  <div
                    key={item.preview}
                    className="relative overflow-hidden rounded-xl border border-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.preview}
                      alt={`Upload ${index + 1}`}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {postError ? <div className="text-xs text-red-200">{postError}</div> : null}
            <div className="flex items-center justify-end">
              <Button onClick={submitAnnouncement} disabled={posting}>
                {posting ? "Posting..." : "Post announcement"}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Announcements</div>
            <div className="text-sm text-white/60">Latest shop updates.</div>
          </div>
          <Badge>{announcements.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          {loading ? (
            <div className="text-sm text-white/60">Loading announcements...</div>
          ) : error ? (
            <div className="text-sm text-red-200">{error}</div>
          ) : announcements.length === 0 ? (
            <div className="text-sm text-white/60">No announcements yet.</div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="rounded-2xl border border-white/10 bg-bg-900/30 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">
                        {announcement.title || "Announcement"}
                      </div>
                      {!announcement.is_active ? (
                        <Badge className="border-red-500/30 text-red-200">Hidden</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-white/50">
                      {formatDate(announcement.created_at)}
                    </div>
                  </div>
                  {announcement.body ? (
                    <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap">
                      {announcement.body}
                    </div>
                  ) : null}
                  {announcement.image_urls?.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {announcement.image_urls.map((url) => (
                        <div
                          key={url}
                          className="overflow-hidden rounded-xl border border-white/10"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Announcement" className="h-28 w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeAnnouncement(announcement.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
