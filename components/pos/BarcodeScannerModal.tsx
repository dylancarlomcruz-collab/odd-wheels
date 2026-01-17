"use client";

import * as React from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type BarcodeScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
};

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
}: BarcodeScannerModalProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const handledRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError(null);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser.");
      return;
    }

    const reader = new BrowserMultiFormatReader();
    let active = true;

    const start = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;

        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result) => {
            if (!active || !result || handledRef.current) return;
            handledRef.current = true;
            onScan(result.getText());
          }
        );
      } catch (err) {
        if (!active) return;
        setError("Unable to access camera. Check permissions.");
      }
    };

    start();

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onScan]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-lg font-semibold">Scan Barcode</div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-bg-900">
              <video
                ref={videoRef}
                className="h-64 w-full object-cover"
                autoPlay
                muted
                playsInline
              />
            </div>
            {error ? (
              <div className="text-sm text-red-300">{error}</div>
            ) : (
              <div className="text-sm text-white/60">
                Point the camera at a barcode to scan automatically.
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
