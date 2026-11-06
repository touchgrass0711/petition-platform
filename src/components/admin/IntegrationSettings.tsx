"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { useAdminSession } from "./AdminGate";

type Field = { key: string; secret: boolean; source: "panel" | "env" | "unset"; value?: string };
type Status = {
  fields: Field[];
  encryption: boolean;
  audit: { at: string | null; field: string; action: string }[];
  envOnly: { name: string; set: boolean }[];
};
const SOURCE = { panel: "Panel", env: "Vercel env", unset: "Not set" } as const;

/** Master only: service keys that override Vercel env (ADR 0007). Secrets are write-only; the API is a 404 for anyone else, so this renders nothing for them. */
export function IntegrationSettings() {
  const session = useAdminSession();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-integrations"], queryFn: () => adminApi<Status>(session, "/api/admin/integrations"), retry: false });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;

  async function save(key: string, value: string | null) {
    if (DEMO_MODE) return void toast(DEMO_DISABLED_MESSAGE);
    setBusy(key);
    try {
      await adminApi(session, "/api/admin/integrations", { method: "PUT", body: JSON.stringify({ field: key, value }) });
      toast.success(value === null ? "Override cleared" : "Saved");
      setDraft((d) => ({ ...d, [key]: "" }));
      await qc.invalidateQueries({ queryKey: ["admin-integrations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          A value saved here overrides Vercel env. Secrets are never shown; leave a box empty to keep the current value. Saving needs a sign-in from the last 10 minutes.
          {!data.encryption && " Secrets can't be saved until SETTINGS_ENCRYPTION_KEY is set in Vercel."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.fields.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor={f.key} className="font-mono text-xs">{f.key}</label>
              <Badge>{SOURCE[f.source]}</Badge>
            </div>
            <div className="flex gap-2">
              <Input
                id={f.key}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={f.secret ? (f.source === "unset" ? "Not set" : "•••• set") : (f.value ?? "Not set")}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
              <Button size="sm" disabled={busy === f.key || !draft[f.key]?.trim()} onClick={() => save(f.key, draft[f.key].trim())}>
                Save
              </Button>
              {f.source === "panel" && (
                <Button size="sm" variant="outline" disabled={busy === f.key} onClick={() => save(f.key, null)}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className="grid gap-1 text-sm">
          <p className="font-medium">Vercel env only</p>
          <p className="text-muted-foreground">Change these in Vercel → Settings → Environment Variables, then redeploy.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.envOnly.map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-2 font-mono text-xs">
                {e.name} <span className={e.set ? "" : "text-destructive"}>{e.set ? "Set" : "Not set"}</span>
              </li>
            ))}
          </ul>
        </div>
        {data.audit.length > 0 && (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Recent changes</p>
            <ul className="grid gap-0.5 text-xs text-muted-foreground">
              {data.audit.map((a, i) => (
                <li key={i}>
                  {a.at ? new Date(a.at).toLocaleString() : "…"}: {a.action} <span className="font-mono">{a.field}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
