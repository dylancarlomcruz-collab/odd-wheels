"use client";

import { Card, CardBody } from "@/components/ui/Card";
import { useSettings } from "@/hooks/useSettings";
import { Truck } from "lucide-react";

export function ShippingScheduleBanner() {
  const { settings } = useSettings();

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent-500/20 border border-accent-500/30 grid place-items-center">
          <Truck className="h-5 w-5 text-accent-300" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Shipping Schedule</div>
          <div className="text-sm text-white/70">
            {settings?.shipping_schedule_text ?? "Set shipping schedule in Admin Settings."}
          </div>
          {settings?.shipping_cutoff_text ? (
            <div className="text-sm text-white/50 mt-1">Cut-off: {settings.shipping_cutoff_text}</div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
