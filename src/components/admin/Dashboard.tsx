"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import type { Petition } from "@/lib/types";
import { useAdminSession } from "./AdminGate";
import { AdminShell } from "./AdminShell";
import { Metrics } from "./metrics/Metrics";

export function Dashboard({ petition }: { petition: Petition }) {
  const session = useAdminSession();
  const [goal, setGoal] = useState(petition.goal);

  const api = <T,>(path: string, init?: RequestInit) => adminApi<T>(session, path, init);

  // Demo Mode: controls look live but never call the API.
  async function guarded(action: () => Promise<unknown>, success: string) {
    if (DEMO_MODE) return void toast(DEMO_DISABLED_MESSAGE);
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminShell email={session.email} title="Dashboard">
      <Metrics />

      <div className="grid gap-4 md:gap-6 xl:max-w-md">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Signature goal shown on the progress bar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="goal">Max signatures</Label>
            <div className="flex gap-2">
              <Input
                id="goal"
                type="number"
                min={1}
                value={goal}
                onChange={(e) => (DEMO_MODE ? toast(DEMO_DISABLED_MESSAGE) : setGoal(Number(e.target.value)))}
              />
              <Button onClick={() => guarded(() => api("/api/admin/petition", { method: "PATCH", body: JSON.stringify({ goal }) }), "Goal updated")}>
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

    </AdminShell>
  );
}
