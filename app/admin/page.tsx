import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Admin Dashboard</div>
          <div className="text-sm text-white/60">Manage inventory, tabs, notices, and settings.</div>
        </CardHeader>
        <CardBody className="text-white/70 space-y-2">
          <div>• Inventory input supports barcode auto-fill + image auto-fetch (admin confirms).</div>
          <div>• Buyers cannot see sold-out products/variants.</div>
          <div>• Payment webhook will auto-approve and deduct inventory via RPC.</div>
        </CardBody>
      </Card>
    </div>
  );
}
