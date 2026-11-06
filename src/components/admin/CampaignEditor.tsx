"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import type { Campaign } from "@/lib/campaign";
import { useAdminSession } from "./AdminGate";
import { AdminShell } from "./AdminShell";
import { CampaignForm } from "./CampaignForm";
import { CommentModeration } from "./CommentModeration";

/** New campaign (slug null) or loads an existing one, drafts included, then shows the form. */
export function CampaignEditor({ slug }: { slug: string | null }) {
  const session = useAdminSession();
  const { data, isError } = useQuery({
    queryKey: ["admin-campaign", slug],
    queryFn: () => adminApi<{ campaign: Campaign }>(session, `/api/admin/campaigns/${slug}`),
    enabled: slug !== null,
  });
  return (
    <AdminShell email={session.email} title={slug ? "Edit campaign" : "New campaign"}>
      {slug === null ? (
        <CampaignForm campaign={null} />
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load this campaign.</p>
      ) : data ? (
        <>
          <CampaignForm campaign={data.campaign} />
          <CommentModeration slug={data.campaign.slug} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </AdminShell>
  );
}
