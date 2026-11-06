import { AdminGate } from "@/components/admin/AdminGate";
import { CampaignEditor } from "@/components/admin/CampaignEditor";

export default async function EditCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <AdminGate>
      <CampaignEditor slug={(await params).slug} />
    </AdminGate>
  );
}
