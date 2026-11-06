import { AdminGate } from "@/components/admin/AdminGate";
import { CampaignsAdmin } from "@/components/admin/CampaignsAdmin";

export default function CampaignsPage() {
  return (
    <AdminGate>
      <CampaignsAdmin />
    </AdminGate>
  );
}
