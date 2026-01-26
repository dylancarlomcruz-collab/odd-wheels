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
  pinned: boolean;
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
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const loadAnnouncements = React.useCallback(
    async (includeInactive: boolean) => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("announcements")
        .select("id,user_id,title,body,image_urls,is_active,pinned,created_at")
        .order("pinned", { ascending: false })
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
    setPostError(null);
    const next = Array.from(files).map((file) => ({
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

  function moveMedia(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setMedia((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function insertPlaceholder(index: number) {
    const token = `{image:${index + 1}}`;
    const textarea = bodyRef.current;
    const current = body;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const pos = start + token.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  function renderBodyWithImages(text: string, imageUrls: string[]) {
    const parts = text.split(/(\{image:\d+\})/g);
    return parts.map((part, index) => {
      const match = part.match(/^\{image:(\d+)\}$/);
      if (match) {
        const imageIndex = Number(match[1]) - 1;
        const url = imageUrls?.[imageIndex];
        if (!url) {
          return (
            <div key={`missing-${index}`} className="text-xs text-white/40">
              [Missing image {match[1]}]
            </div>
          );
        }
        return (
          <button
            key={`img-${index}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLightboxUrl(url);
            }}
            className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Announcement image ${match[1]}`}
              className="w-full h-auto object-contain"
            />
          </button>
        );
      }
      if (!part) return null;
      return (
        <div key={`text-${index}`} className="text-sm text-white/80 whitespace-pre-wrap">
          {part}
        </div>
      );
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

  function startEdit(announcement: Announcement) {
    if (!isAdmin) return;
    setEditingId(announcement.id);
    setEditTitle(announcement.title ?? "");
    setEditBody(announcement.body ?? "");
    setExpandedId(announcement.id);
  }

  async function saveEdit(id: string) {
    if (!isAdmin) return;
    setSavingEdit(true);
    setError(null);
    try {
      const trimmedTitle = editTitle.trim();
      const trimmedBody = editBody.trim();
      const { error: updateError } = await supabase
        .from("announcements")
        .update({
          title: trimmedTitle || null,
          body: trimmedBody || "",
        })
        .eq("id", id);
      if (updateError) throw updateError;
      setEditingId(null);
      await loadAnnouncements(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to update announcement.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function togglePinned(announcement: Announcement) {
    if (!isAdmin) return;
    const { error: updateError } = await supabase
      .from("announcements")
      .update({ pinned: !announcement.pinned })
      .eq("id", announcement.id);
    if (updateError) {
      setError(updateError.message || "Failed to update pin status.");
      return;
    }
    await loadAnnouncements(true);
  }

  const scheduleText = settings?.shipping_schedule_text?.trim();
  const cutoffText = settings?.shipping_cutoff_text?.trim();

  return (
    <>
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
              ref={bodyRef}
              label="Message"
              hint="Use {image:1}, {image:2}, etc. to place photos inside the message."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement..."
            />
            <label className="block text-sm text-white/80">
              Photos
              <span className="ml-2 text-[11px] text-white/50">
                Original ratio and quality preserved. Use placeholders to position them.
              </span>
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
                    className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/20 ${
                      dragIndex === index ? "ring-2 ring-white/30" : ""
                    }`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", String(index));
                      setDragIndex(index);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(event.dataTransfer.getData("text/plain"));
                      if (!Number.isNaN(from)) moveMedia(from, index);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.preview}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-auto object-contain"
                    />
                    <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
                      Image {index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => insertPlaceholder(index)}
                      className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white"
                    >
                      Insert in message
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
              {announcements.map((announcement) => {
                const isExpanded = expandedId === announcement.id;
                const isEditing = editingId === announcement.id;
                return (
                  <div
                    key={announcement.id}
                    className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedId((prev) =>
                        prev === announcement.id ? null : announcement.id
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedId((prev) =>
                          prev === announcement.id ? null : announcement.id
                        );
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">
                          {announcement.title || "Announcement"}
                        </div>
                        {announcement.pinned ? (
                          <Badge className="border-amber-400/40 text-amber-200">Pinned</Badge>
                        ) : null}
                        {!announcement.is_active ? (
                          <Badge className="border-red-500/30 text-red-200">Hidden</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/50">
                        {formatDate(announcement.created_at)}
                      </div>
                    </div>
                  {isEditing ? (
                    <div
                      className="mt-3 space-y-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Input
                        label="Title (optional)"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        placeholder="Announcement title"
                      />
                      <Textarea
                        label="Message"
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        placeholder="Write your announcement..."
                      />
                    </div>
                  ) : (
                    <div
                      className={
                        isExpanded
                          ? "mt-3 space-y-3"
                          : "mt-3 space-y-3 max-h-[420px] overflow-hidden"
                      }
                    >
                      {announcement.body ? (
                        (() => {
                          const inline = /\{image:\d+\}/.test(announcement.body ?? "");
                          const urls = announcement.image_urls ?? [];
                          return inline ? (
                            renderBodyWithImages(announcement.body, urls)
                          ) : (
                            <div
                              className={
                                isExpanded
                                  ? "text-sm text-white/80 whitespace-pre-wrap"
                                  : "text-sm text-white/80 whitespace-pre-wrap line-clamp-4"
                              }
                            >
                              {announcement.body}
                            </div>
                          );
                        })()
                      ) : null}
                      {announcement.image_urls?.length &&
                      !/\{image:\d+\}/.test(announcement.body ?? "") ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {announcement.image_urls.map((url, index) => (
                            <button
                              key={url}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setLightboxUrl(url);
                              }}
                              className="overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`Announcement ${index + 1}`}
                                className="w-full h-auto object-contain"
                              />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                    {!isExpanded ? (
                      <div className="mt-2 text-xs text-white/40">
                        Click to view full post
                      </div>
                    ) : null}
                    {isAdmin ? (
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePinned(announcement);
                          }}
                        >
                          {announcement.pinned ? "Unpin" : "Pin"}
                        </Button>
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingId(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                saveEdit(announcement.id);
                              }}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEdit(announcement);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeAnnouncement(announcement.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
    {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setLightboxUrl(null);
              }}
              className="absolute -top-3 -right-3 rounded-full bg-black/80 px-2 py-1 text-xs text-white"
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Announcement full view"
              className="max-h-[90vh] max-w-[90vw] rounded-xl border border-white/10 object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
