import { AdminGate } from "@/components/admin/AdminGate";
import { Dashboard } from "@/components/admin/Dashboard";
import { getPetition } from "@/lib/petition";

export const revalidate = 86400;

export default async function AdminPage() {
  return (
    <AdminGate>
      <Dashboard petition={await getPetition()} />
    </AdminGate>
  );
}
