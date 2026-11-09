"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { campaignPhase, isAchieved, type Campaign, type Phase } from "@/lib/campaign";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { formatInZone } from "@/lib/use-phase";
import { cn } from "@/lib/utils";
import { useAdminSession, useAdminSettings } from "./AdminGate";
import { AdminShell } from "./AdminShell";
import { ConfirmDialog } from "./ConfirmDialog";

const PHASE: Record<Phase, string> = { draft: "Draft", scheduled: "Scheduled", live: "Live", ended: "Ended" };

export function CampaignsAdmin() {
  const session = useAdminSession();
  const { can } = useAdminSettings();
  const qc = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => adminApi<{ campaigns: Campaign[] }>(session, "/api/admin/campaigns"),
  });
  const rows = data?.campaigns.filter((c) => (c.deletedAt !== null) === showDeleted) ?? [];

  // Demo Mode: buttons stay live but never call the API.
  async function change(slug: string, body: { featured: boolean } | { deleted: boolean }, success: string) {
    if (DEMO_MODE) return void toast(DEMO_DISABLED_MESSAGE);
    try {
      await adminApi(session, `/api/admin/campaigns/${slug}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(success);
      await qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminShell email={session.email} title="Campaigns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Filter campaigns">
          {[false, true].map((deleted) => (
            <Button key={String(deleted)} size="sm" variant={showDeleted === deleted ? "default" : "outline"} aria-pressed={showDeleted === deleted} onClick={() => setShowDeleted(deleted)}>
              {deleted ? "Deleted" : "Campaigns"}
            </Button>
          ))}
        </div>
        {data && can("create", data.campaigns.filter((c) => c.deletedAt === null).length) && (
          <Link href="/admin/campaigns/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden /> New campaign
          </Link>
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this campaign?"
        confirmLabel="Delete"
        destructive
        typeToConfirm={deleting?.slug}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const c = deleting!;
          setDeleting(null);
          void change(c.slug, { deleted: true }, "Deleted. Restore it from the Deleted filter.");
        }}
      >
        <p>
          <span className="text-foreground">{deleting?.title}</span> disappears from the site and signing stops. Comments and
          signatures are kept, the link stays reserved, and you can restore it from the Deleted filter.
        </p>
      </ConfirmDialog>
      <Card className="overflow-hidden rounded-2xl">
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium sm:px-6">Campaign</th>
                <th className="px-4 py-3 font-medium sm:px-6">Status</th>
                <th className="px-4 py-3 text-right font-medium sm:px-6">Signatures</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell sm:px-6">Starts</th>
                <th className="px-4 py-3 text-right font-medium sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isError && <tr><td colSpan={5} className="px-6 py-4 text-destructive">Could not load campaigns.</td></tr>}
              {isPending && <tr><td colSpan={5} className="px-6 py-4 text-muted-foreground">Loading…</td></tr>}
              {data && rows.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-4 text-muted-foreground">{showDeleted ? "No deleted campaigns." : "No campaigns yet. Use New campaign to add the first one."}</td></tr>
              )}
              {rows.map((c) => {
                const phase = campaignPhase(c);
                return (
                  <tr key={c.slug} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 sm:px-6">
                      <Link href={`/admin/campaigns/${c.slug}`} className="font-medium hover:underline">
                        {c.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">/c/{c.slug}</p>
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex flex-wrap gap-1">
                        <Badge className={cn(phase === "live" && "text-foreground")}>{c.deletedAt ? "Deleted" : PHASE[phase]}</Badge>
                        {isAchieved(c) && <Badge>Achieved</Badge>}
                        {c.featured && <Badge className="text-foreground">Featured</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums sm:px-6">
                      {c.signatureCount.toLocaleString("en-US")}
                      <span className="text-muted-foreground"> / {c.goal.toLocaleString("en-US")}</span>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground md:table-cell sm:px-6">
                      {formatInZone(c.startAt, c.timeZone)}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex justify-end gap-1">
                        {phase !== "draft" && (
                          <Link href={`/c/${c.slug}`} target="_blank" aria-label={`View ${c.title}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                            <ExternalLink aria-hidden />
                          </Link>
                        )}
                        {c.deletedAt ? (
                          can("delete") && (
                            <Button variant="outline" size="icon" aria-label={`Restore ${c.title}`} onClick={() => change(c.slug, { deleted: false }, "Restored")}>
                              <ArchiveRestore aria-hidden />
                            </Button>
                          )
                        ) : (
                          <>
                            {can("feature") && <Button
                              variant="outline"
                              size="icon"
                              aria-label={c.featured ? `Unfeature ${c.title}` : `Feature ${c.title}`}
                              aria-pressed={c.featured}
                              onClick={() => change(c.slug, { featured: !c.featured }, c.featured ? "No longer featured" : "Featured")}
                            >
                              <Star aria-hidden className={cn(c.featured && "fill-current")} />
                            </Button>}
                            {can("delete") && (
                              <Button variant="outline" size="icon" aria-label={`Delete ${c.title}`} onClick={() => setDeleting(c)}>
                                <Trash2 aria-hidden />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  );
}
