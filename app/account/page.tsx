"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PHONE_MAX_LENGTH, sanitizePhone, validatePhone11 } from "@/lib/phone";
import {
  mergeShippingDefaults,
  normalizeShippingDefaults,
  type ShippingDefaults,
} from "@/lib/shippingDefaults";
type CustomerRow = {
  id: string;
  name: string | null;
  username: string | null;
  contact: string | null;
  shipping_defaults: ShippingDefaults | null;
};
const PHONE_LENGTH = PHONE_MAX_LENGTH;
const LALAMOVE_BUCKET = "shipping-defaults";

function formatPhoneError(value: string, show: boolean): string | undefined {
  const digits = sanitizePhone(value);
  if (!show || !digits) return undefined;
  return validatePhone11(digits)
    ? undefined
    : "Use an 11-digit PH mobile number (09XXXXXXXXX).";
}

function guessImageExtension(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || file.type.includes("png")) return "png";
  if (name.endsWith(".webp") || file.type.includes("webp")) return "webp";
  return "jpg";
}

function getStoragePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const rest = url.slice(index + marker.length);
  return rest.split("?")[0] || null;
}

async function uploadLalamoveMap(file: File, userId: string): Promise<string> {
  const extension = guessImageExtension(file);
  const path = `${userId}/lalamove-map-${Date.now()}.${extension}`;
  const contentType = file.type || "image/jpeg";

  const { error } = await supabase.storage
    .from(LALAMOVE_BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) throw error;
  const { data } = supabase.storage.from(LALAMOVE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const emailRedirectTo = "https://www.odd-wheels.com/";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [saveAttempted, setSaveAttempted] = React.useState(false);

  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [contactNumber, setContactNumber] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [shippingDefaults, setShippingDefaults] = React.useState<ShippingDefaults>(() =>
    normalizeShippingDefaults({})
  );
  const [shippingDefaultsRaw, setShippingDefaultsRaw] = React.useState<unknown>({});
  const [lalamoveUploading, setLalamoveUploading] = React.useState(false);
  const [lalamovePinLoading, setLalamovePinLoading] = React.useState(false);
  const [lalamovePinError, setLalamovePinError] = React.useState<string | null>(
    null
  );
  const [phoneTouched, setPhoneTouched] = React.useState({
    profile: false,
    jnt: false,
    lbc: false,
    lalamove: false,
  });

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) {
        if (mounted) setLoading(false);
        return;
      }

      setLoading(true);
      setMsg(null);

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, username, contact, shipping_defaults")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(error);
        setMsg(error.message || "Failed to load profile");
      }

      const row = (data as CustomerRow | null) ?? null;
      setName(
        row?.name ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          ""
      );
      setUsername(row?.username ?? user.user_metadata?.username ?? "");
      setContactNumber(
        sanitizePhone(row?.contact ?? user.user_metadata?.contact_number ?? "")
      );
      setEmail(user.email ?? "");
      const rawDefaults = row?.shipping_defaults ?? {};
      setShippingDefaults(normalizeShippingDefaults(rawDefaults));
      setShippingDefaultsRaw(rawDefaults ?? {});
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  async function onSave() {
    if (!user) return;
    setSaving(true);
    setMsg(null);
    setSaveAttempted(true);

    try {
      const sanitizedContact = sanitizePhone(contactNumber);
      const normalizedDefaults = normalizeShippingDefaults(shippingDefaults);
      const invalidPhones = [
        sanitizedContact,
        normalizedDefaults.jnt.contact_number,
        normalizedDefaults.lbc.contact_number,
        normalizedDefaults.lalamove.recipient_phone,
      ].some((value) => value.length > 0 && !validatePhone11(value));

      if (invalidPhones) {
        setMsg("Please fix the highlighted contact numbers.");
        setSaving(false);
        return;
      }

      const trimmedEmail = email.trim();
      if (trimmedEmail && trimmedEmail !== (user.email ?? "")) {
        const { error } = await supabase.auth.updateUser(
          { email: trimmedEmail },
          { emailRedirectTo }
        );
        if (error) throw error;
      }

      if (newPassword.trim()) {
        const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
        if (error) throw error;
        setNewPassword("");
      }

      const mergedDefaults = mergeShippingDefaults(
        shippingDefaultsRaw,
        normalizedDefaults
      );

      const payload = {
        id: user.id,
        name: name.trim() || null,
        username: username.trim() || null,
        contact: sanitizedContact || null,
        shipping_defaults: mergedDefaults ?? {},
      };

      const { data: saved, error: upsertErr } = await supabase
        .from("customers")
        .upsert(payload, { onConflict: "id" })
        .select("id, name, username, contact, shipping_defaults")
        .single();
      if (upsertErr) throw upsertErr;

      if (saved) {
        setName(saved.name ?? "");
        setUsername(saved.username ?? "");
        setContactNumber(sanitizePhone(saved.contact ?? ""));
        const savedDefaults = normalizeShippingDefaults(
          (saved.shipping_defaults as ShippingDefaults) ?? {}
        );
        setShippingDefaults(savedDefaults);
        setShippingDefaultsRaw(saved.shipping_defaults ?? {});
      }

      await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: name.trim() || null,
          username: username.trim() || null,
          contact_number: sanitizedContact || null,
        });

      await supabase.auth.updateUser({
        data: {
          full_name: name.trim() || null,
          username: username.trim() || null,
          contact_number: sanitizedContact || null,
        },
      });

      setMsg("Saved.");
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function persistShippingDefaults(
    nextDefaults: ShippingDefaults,
    successMessage: string
  ) {
    if (!user) return;
    const mergedDefaults = mergeShippingDefaults(
      shippingDefaultsRaw,
      nextDefaults
    );

    const { data, error } = await supabase
      .from("customers")
      .upsert({ id: user.id, shipping_defaults: mergedDefaults }, { onConflict: "id" })
      .select("shipping_defaults")
      .single();

    if (error) throw error;

    const savedDefaults = normalizeShippingDefaults(
      (data?.shipping_defaults as ShippingDefaults) ?? mergedDefaults
    );
    setShippingDefaults(savedDefaults);
    setShippingDefaultsRaw(data?.shipping_defaults ?? mergedDefaults);
    setMsg(successMessage);
  }

  async function onUploadLalamoveMap(file: File | null) {
    if (!user || !file) return;
    setMsg(null);
    setLalamoveUploading(true);
    setLalamovePinError(null);
    try {
      const url = await uploadLalamoveMap(file, user.id);
      const nextDefaults = normalizeShippingDefaults({
        ...shippingDefaults,
        lalamove: {
          ...shippingDefaults.lalamove,
          map_screenshot_url: url,
          map_url: null,
          map_lat: null,
          map_lng: null,
        },
      });
      await persistShippingDefaults(nextDefaults, "Map image saved.");
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Upload failed");
    } finally {
      setLalamoveUploading(false);
    }
  }

  async function onRemoveLalamoveMap() {
    if (!user) return;
    const currentUrl = shippingDefaults.lalamove?.map_screenshot_url ?? "";
    if (!currentUrl) return;
    setMsg(null);
    setLalamoveUploading(true);
    setLalamovePinError(null);
    try {
      const path = getStoragePathFromPublicUrl(currentUrl, LALAMOVE_BUCKET);
      if (path) {
        await supabase.storage.from(LALAMOVE_BUCKET).remove([path]);
      }
      const nextDefaults = normalizeShippingDefaults({
        ...shippingDefaults,
        lalamove: {
          ...shippingDefaults.lalamove,
          map_screenshot_url: "",
          map_url: null,
          map_lat: null,
          map_lng: null,
        },
      });
      await persistShippingDefaults(nextDefaults, "Map image removed.");
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to remove image");
    } finally {
      setLalamoveUploading(false);
    }
  }

  async function requestLalamovePin(payload: {
    address?: string;
    lat?: number;
    lng?: number;
  }) {
    setLalamovePinError(null);
    setLalamovePinLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/lalamove/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to pin map.");
      }

      const data = json.data ?? {};
      const mapImageUrl = String(data.map_image_url ?? "");
      const mapUrl = String(data.map_url ?? "");
      const lat = Number(data.lat);
      const lng = Number(data.lng);

      const nextDefaults = normalizeShippingDefaults({
        ...shippingDefaults,
        lalamove: {
          ...shippingDefaults.lalamove,
          map_screenshot_url: mapImageUrl,
          map_url: mapUrl || null,
          map_lat: Number.isFinite(lat) ? lat : null,
          map_lng: Number.isFinite(lng) ? lng : null,
        },
      });

      if (!payload.address && typeof data.address === "string" && data.address) {
        nextDefaults.lalamove.dropoff_address = data.address;
      }

      await persistShippingDefaults(nextDefaults, "Pinned location saved.");
    } catch (e: any) {
      setLalamovePinError(e?.message ?? "Failed to pin map.");
    } finally {
      setLalamovePinLoading(false);
    }
  }

  function onPinFromAddress() {
    const address = shippingDefaults.lalamove?.dropoff_address ?? "";
    const trimmed = address.trim();
    if (!trimmed) {
      setLalamovePinError("Enter a drop-off address to pin.");
      return;
    }
    requestLalamovePin({ address: trimmed });
  }

  function onUseCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLalamovePinError("Geolocation is not supported on this device.");
      return;
    }

    setLalamovePinError(null);
    setLalamovePinLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestLalamovePin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setLalamovePinLoading(false);
        setLalamovePinError(err?.message || "Unable to get current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const profilePhoneError = formatPhoneError(
    contactNumber,
    phoneTouched.profile || saveAttempted
  );
  const jntPhoneError = formatPhoneError(
    shippingDefaults.jnt?.contact_number ?? "",
    phoneTouched.jnt || saveAttempted
  );
  const lbcPhoneError = formatPhoneError(
    shippingDefaults.lbc?.contact_number ?? "",
    phoneTouched.lbc || saveAttempted
  );
  const lalamovePhoneError = formatPhoneError(
    shippingDefaults.lalamove?.recipient_phone ?? "",
    phoneTouched.lalamove || saveAttempted
  );
  const lalamoveMapUrl = shippingDefaults.lalamove?.map_screenshot_url ?? "";
  const lalamoveMapLink = String(
    shippingDefaults.lalamove?.map_url ?? ""
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="text-sm text-neutral-300">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Account Settings</div>
            <div className="text-sm text-neutral-400">Please log in to manage your account.</div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account Settings</h1>
        <p className="text-sm text-neutral-400">Phone OTP verification is on standby for now.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Profile</div>
          <div className="text-sm text-neutral-400">These are used for checkout defaults.</div>
        </CardHeader>

        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input
              label="Contact Number"
              value={contactNumber}
              onChange={(e) => setContactNumber(sanitizePhone(e.target.value))}
              onBlur={() => setPhoneTouched((p) => ({ ...p, profile: true }))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PHONE_LENGTH}
              error={profilePhoneError}
            />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="pt-2">
            <div className="text-sm font-semibold mb-2">Default Shipping Details</div>

            <div className="space-y-6">
              {/* J&T */}
              <div className="rounded-xl border border-white/10 p-4">
                <div className="font-medium">J&T Delivery</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Recipient Name"
                    value={shippingDefaults.jnt?.recipient_name ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: { ...(p.jnt ?? {}), recipient_name: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="Contact Number"
                    value={shippingDefaults.jnt?.contact_number ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: {
                          ...(p.jnt ?? {}),
                          contact_number: sanitizePhone(e.target.value),
                        },
                      }))
                    }
                    onBlur={() => setPhoneTouched((p) => ({ ...p, jnt: true }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={PHONE_LENGTH}
                    error={jntPhoneError}
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="House/Street/Unit"
                      value={shippingDefaults.jnt?.house_street_unit ?? ""}
                      onChange={(e) =>
                        setShippingDefaults((p) => ({
                          ...p,
                          jnt: {
                            ...(p.jnt ?? {}),
                            house_street_unit: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <Input
                    label="Barangay"
                    value={shippingDefaults.jnt?.barangay ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: { ...(p.jnt ?? {}), barangay: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="City"
                    value={shippingDefaults.jnt?.city ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: { ...(p.jnt ?? {}), city: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="Province"
                    value={shippingDefaults.jnt?.province ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: { ...(p.jnt ?? {}), province: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="Postal Code (optional)"
                    value={shippingDefaults.jnt?.postal_code ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        jnt: { ...(p.jnt ?? {}), postal_code: e.target.value },
                      }))
                    }
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label="Notes (optional)"
                      value={shippingDefaults.jnt?.notes ?? ""}
                      onChange={(e) =>
                        setShippingDefaults((p) => ({
                          ...p,
                          jnt: { ...(p.jnt ?? {}), notes: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* LBC */}
              <div className="rounded-xl border border-white/10 p-4">
                <div className="font-medium">LBC Pickup</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    value={shippingDefaults.lbc?.first_name ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lbc: { ...(p.lbc ?? {}), first_name: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="Last Name"
                    value={shippingDefaults.lbc?.last_name ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lbc: { ...(p.lbc ?? {}), last_name: e.target.value },
                      }))
                    }
                  />
                  <Input
                    label="Contact Number"
                    value={shippingDefaults.lbc?.contact_number ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lbc: {
                          ...(p.lbc ?? {}),
                          contact_number: sanitizePhone(e.target.value),
                        },
                      }))
                    }
                    onBlur={() => setPhoneTouched((p) => ({ ...p, lbc: true }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={PHONE_LENGTH}
                    error={lbcPhoneError}
                  />
                  <Input
                    label="Branch"
                    value={shippingDefaults.lbc?.branch ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({ ...p, lbc: { ...(p.lbc ?? {}), branch: e.target.value } }))
                    }
                  />
                  <Input
                    label="City"
                    value={shippingDefaults.lbc?.city ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lbc: { ...(p.lbc ?? {}), city: e.target.value },
                      }))
                    }
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label="Notes (optional)"
                      value={shippingDefaults.lbc?.notes ?? ""}
                      onChange={(e) =>
                        setShippingDefaults((p) => ({ ...p, lbc: { ...(p.lbc ?? {}), notes: e.target.value } }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Lalamove */}
              <div className="rounded-xl border border-white/10 p-4">
                <div className="font-medium">Lalamove</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Recipient Name"
                    value={shippingDefaults.lalamove?.recipient_name ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lalamove: {
                          ...(p.lalamove ?? {}),
                          recipient_name: e.target.value,
                        },
                      }))
                    }
                  />
                  <Input
                    label="Recipient Phone"
                    value={shippingDefaults.lalamove?.recipient_phone ?? ""}
                    onChange={(e) =>
                      setShippingDefaults((p) => ({
                        ...p,
                        lalamove: {
                          ...(p.lalamove ?? {}),
                          recipient_phone: sanitizePhone(e.target.value),
                        },
                      }))
                    }
                    onBlur={() => setPhoneTouched((p) => ({ ...p, lalamove: true }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={PHONE_LENGTH}
                    error={lalamovePhoneError}
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label="Drop-off Address"
                      value={shippingDefaults.lalamove?.dropoff_address ?? ""}
                      onChange={(e) =>
                        setShippingDefaults((p) => ({
                          ...p,
                          lalamove: { ...(p.lalamove ?? {}), dropoff_address: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Textarea
                      label="Notes (optional)"
                      value={shippingDefaults.lalamove?.notes ?? ""}
                      onChange={(e) =>
                        setShippingDefaults((p) => ({
                          ...p,
                          lalamove: { ...(p.lalamove ?? {}), notes: e.target.value },
                        }))
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={onPinFromAddress}
                        disabled={
                          lalamovePinLoading ||
                          !shippingDefaults.lalamove?.dropoff_address?.trim()
                        }
                      >
                        {lalamovePinLoading ? "Pinning..." : "Pin from address"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={onUseCurrentLocation}
                        disabled={lalamovePinLoading}
                      >
                        Use current location
                      </Button>
                      {lalamoveMapLink ? (
                        <a
                          href={lalamoveMapLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent-700 underline hover:text-accent-600 dark:text-accent-200 dark:hover:text-accent-100"
                        >
                          Open map
                        </a>
                      ) : null}
                    </div>
                    {lalamovePinError ? (
                      <div className="mb-2 text-xs text-red-300">
                        {lalamovePinError}
                      </div>
                    ) : null}
                    <label className="block text-sm mb-1 text-neutral-300">
                      Pinned map (auto pin or image upload)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        onUploadLalamoveMap(file);
                        e.currentTarget.value = "";
                      }}
                      className="block w-full text-sm"
                      disabled={lalamoveUploading || lalamovePinLoading}
                    />
                    <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
                      <span>
                        {lalamoveUploading || lalamovePinLoading
                          ? "Updating..."
                          : lalamoveMapUrl
                          ? "Saved map screenshot."
                          : "No image yet."}
                      </span>
                      {lalamoveMapUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={onRemoveLalamoveMap}
                          disabled={lalamoveUploading}
                        >
                          Remove image
                        </Button>
                      ) : null}
                    </div>
                    {lalamoveMapUrl ? (
                      <img
                        src={lalamoveMapUrl}
                        alt="Lalamove map screenshot"
                        className="mt-3 h-32 w-auto rounded-lg border border-white/10 object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {msg ? <div className="text-sm text-neutral-300">{msg}</div> : null}

          <div>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Security</div>
          <div className="text-sm text-neutral-400">Change your password anytime.</div>
        </CardHeader>
        <CardBody>
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Leave blank to keep your current password."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Account Actions</div>
          <div className="text-sm text-neutral-400">Sign out from this device.</div>
        </CardHeader>
        <CardBody>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
