"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export function AdminMobileBar() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const overlay = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 p-4"
      onClick={() => setOpen(false)}
    >
      <div className="mx-auto w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white/80">Admin Panel</div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </CardHeader>
          <CardBody>
            <AdminNav />
          </CardBody>
        </Card>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-between border-b border-white/5 bg-bg-950/80 px-4 py-3 backdrop-blur">
        <div className="text-sm text-white/70">Admin Panel</div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Menu className="mr-2 h-4 w-4" />
          Menu
        </Button>
      </div>
      {open && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}
