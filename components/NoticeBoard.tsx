"use client";

import { useNotices } from "@/hooks/useNotices";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Megaphone } from "lucide-react";

export function NoticeBoard() {
  const { notices, loading } = useNotices(6);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-accent-300" />
          <div className="font-semibold">Notice Board</div>
        </div>
        <Badge>Latest updates</Badge>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="text-white/60">Loading notices...</div>
        ) : notices.length === 0 ? (
          <div className="text-white/60">No notices posted.</div>
        ) : (
          <div className="space-y-3">
            {notices.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-bg-900/30 p-4">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{n.title}</div>
                  {n.pinned ? (
                    <Badge className="border-accent-500/30 text-accent-700 dark:text-accent-200">
                      Pinned
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-white/70 whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
