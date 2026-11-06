"use client";

import { useQueryClient } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { CAPABILITIES, MODES, type Capability, type Settings } from "@/lib/settings";
import { useAdminSession, useAdminSettings } from "./AdminGate";
import { AdminShell } from "./AdminShell";
import { IntegrationSettings } from "./IntegrationSettings";

const choice = "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-foreground";

/** Master-only (developer claim): system mode and which capabilities other admins may use. Anyone else gets a 404; the server enforces both. */
export function DeveloperSettings() {
  const session = useAdminSession();
  const qc = useQueryClient();
  const { settings, developer, loading } = useAdminSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const toggle = (cap: Capability, on: boolean) =>
    setDraft((d) => ({ ...d, disabled: on ? d.disabled.filter((c) => c !== cap) : [...d.disabled, cap] }));

  async function save() {
    setSaving(true);
    try {
      await adminApi(session, "/api/admin/settings", { method: "PUT", body: JSON.stringify(draft) });
      toast.success("Settings saved");
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="flex min-h-[80vh] items-center justify-center text-sm text-muted-foreground">Loading…</p>;
  if (!developer) notFound();

  return (
    <AdminShell email={session.email} title="Master settings">
      <div className="grid max-w-2xl gap-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>System mode</CardTitle>
              <CardDescription>
                Single campaign: the home page shows the featured campaign (else the newest live one), campaign links go home, and admins can only edit that campaign. Multiple campaigns: every feature is on.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(MODES) as Settings["mode"][]).map((mode) => (
                <label key={mode} className={choice}>
                  <input type="radio" name="mode" checked={draft.mode === mode} onChange={() => setDraft((d) => ({ ...d, mode }))} />
                  {MODES[mode]}
                </label>
              ))}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Admin capabilities</CardTitle>
              <CardDescription>What other admins may do. The Master account keeps every capability the mode allows.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(CAPABILITIES) as Capability[]).map((cap) => (
                <label key={cap} className={choice}>
                  <input type="checkbox" checked={!draft.disabled.includes(cap)} onChange={(e) => toggle(cap, e.target.checked)} />
                  {CAPABILITIES[cap]}
                </label>
              ))}
            </CardContent>
          </Card>
          <div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          <IntegrationSettings />
      </div>
    </AdminShell>
  );
}
