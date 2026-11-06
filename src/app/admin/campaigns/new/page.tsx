import { AdminGate } from "@/components/admin/AdminGate";
import { CampaignEditor } from "@/components/admin/CampaignEditor";

export default function NewCampaignPage() {
  return (
    <AdminGate>
      <CampaignEditor slug={null} />
    </AdminGate>
  );
}
