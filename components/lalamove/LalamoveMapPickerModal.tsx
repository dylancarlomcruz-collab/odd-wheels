"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type LatLng = {
  lat: number;
  lng: number;
};

type LalamoveMapPickerModalProps = {
  open: boolean;
  title?: string;
  initialPosition?: LatLng | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (pos: LatLng) => void;
};

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 };
const DEFAULT_ZOOM = 16;

export function LalamoveMapPickerModal({
  open,
  title = "Pin your location",
  initialPosition,
  saving = false,
  onClose,
  onSave,
}: LalamoveMapPickerModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [position, setPosition] = React.useState<LatLng | null>(initialPosition ?? null);
  const [center, setCenter] = React.useState<LatLng>(initialPosition ?? DEFAULT_CENTER);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchText, setSearchText] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setPosition(initialPosition ?? null);
    setCenter(initialPosition ?? DEFAULT_CENTER);
    setError(null);
    setSearchText("");
    setSearchError(null);
    setResolvedAddress(null);
  }, [open, initialPosition?.lat, initialPosition?.lng]);

  const locate = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }

    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setCenter(next);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(err?.message || "Unable to get current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const onSearch = React.useCallback(async () => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      setSearchError("Enter an address to search.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setError(null);

    try {
      const res = await fetch("/api/lalamove/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Address not found.");
      }

      const data = json.data ?? {};
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Unable to locate that address.");
      }

      const next = { lat, lng };
      setPosition(next);
      setCenter(next);
      setResolvedAddress(
        typeof data.address === "string" && data.address ? data.address : null
      );
    } catch (err: any) {
      setSearchError(err?.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }, [searchText]);

  React.useEffect(() => {
    if (!open || !mounted) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const markerPosition = position ?? center;

  const content = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-3xl border border-white/10 bg-bg-900/95 shadow-soft">
        <CardHeader className="space-y-1">
          <div className="text-xl font-semibold">{title}</div>
          <div className="text-sm text-white/60">
            Drag the pin or click on the map to adjust the location.
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Input
                label="Search address"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearch();
                  }
                }}
                placeholder="Search street, barangay, city"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onSearch}
              disabled={searching || saving}
            >
              {searching ? "Searching..." : "Search"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={locate}
              disabled={locating || saving}
            >
              {locating ? "Locating..." : "Use my current location"}
            </Button>
          </div>
          {searchError ? (
            <div className="text-xs text-red-300">{searchError}</div>
          ) : null}
          {resolvedAddress ? (
            <div className="text-xs text-white/60">
              Found: {resolvedAddress}
            </div>
          ) : null}
          <LeafletMap
            center={center}
            position={markerPosition}
            zoom={DEFAULT_ZOOM}
            onPositionChange={(next) => {
              setPosition(next);
              setCenter(next);
              setError(null);
              setResolvedAddress(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span>Tap or drag to place the pin.</span>
          </div>
          {error ? <div className="text-xs text-red-300">{error}</div> : null}
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!position) {
                setError("Pick a location on the map.");
                return;
              }
              onSave(position);
            }}
            disabled={saving || locating}
          >
            {saving ? "Saving..." : "Save location"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );

  return createPortal(content, document.body);
}
