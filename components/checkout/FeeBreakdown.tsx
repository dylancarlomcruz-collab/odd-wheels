import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatPHP } from "@/lib/money";

export type FeeLine = { label: string; amount: number; muted?: boolean };

export function FeeBreakdown({ lines, total }: { lines: FeeLine[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="font-semibold">Fee Breakdown</div>
        <div className="text-sm text-white/60">No hidden fees.</div>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.label} className="flex items-center justify-between">
              <div className={l.muted ? "text-white/50" : "text-white/75"}>{l.label}</div>
              <div className={l.muted ? "text-white/50" : "text-white/85"}>{formatPHP(l.amount)}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3 flex items-center justify-between">
          <div className="font-semibold">Total</div>
          <div className="text-xl text-price">{formatPHP(total)}</div>
        </div>
      </CardBody>
    </Card>
  );
}
