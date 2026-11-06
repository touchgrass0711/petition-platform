import { AdminGate } from "@/components/admin/AdminGate";
import { DeveloperSettings } from "@/components/admin/DeveloperSettings";

export default function DeveloperPage() {
  return (
    <AdminGate hidden>
      <DeveloperSettings />
    </AdminGate>
  );
}
