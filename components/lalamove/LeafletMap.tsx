"use client";

import * as React from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

type LatLng = {
  lat: number;
  lng: number;
};

type LeafletMapProps = {
  center: LatLng;
  position: LatLng;
  zoom?: number;
  onPositionChange: (pos: LatLng) => void;
  interactive?: boolean;
  className?: string;
};

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const resolveAssetUrl = (
  asset: string | { src: string }
): string => (typeof asset === "string" ? asset : asset.src);

const markerIcon = L.icon({
  iconRetinaUrl: resolveAssetUrl(iconRetinaUrl),
  iconUrl: resolveAssetUrl(iconUrl),
  shadowUrl: resolveAssetUrl(shadowUrl),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapUpdater({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

function MapClickHandler({ onSelect }: { onSelect: (pos: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export default function LeafletMap({
  center,
  position,
  zoom = 16,
  onPositionChange,
  interactive = true,
  className = "",
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      zoomControl={interactive}
      className={`h-80 w-full rounded-xl border border-white/10 bg-bg-900 overflow-hidden ${className}`.trim()}
    >
      <MapUpdater center={center} zoom={zoom} />
      {interactive ? <MapClickHandler onSelect={onPositionChange} /> : null}
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
      />
      <Marker
        position={[position.lat, position.lng]}
        icon={markerIcon}
        draggable={interactive}
        eventHandlers={{
          dragend(event) {
            const marker = event.target as L.Marker;
            const next = marker.getLatLng();
            onPositionChange({ lat: next.lat, lng: next.lng });
          },
        }}
      />
    </MapContainer>
  );
}
