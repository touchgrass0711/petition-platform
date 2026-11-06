"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignPage } from "@/lib/petition";
import { CampaignCard } from "./CampaignCard";

async function fetchPage(after: string | null): Promise<CampaignPage> {
  const res = await fetch(`/api/campaigns${after ? `?after=${encodeURIComponent(after)}` : ""}`);
  if (!res.ok) throw new Error("Failed to load campaigns");
  return res.json();
}

export function CampaignList({ initialPage, renderedAt }: { initialPage: CampaignPage; renderedAt: number }) {
  // cursors[i] loads page i; page 0 is server-rendered.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const page = cursors.length - 1;
  const { data, isFetching, isError } = useQuery({
    queryKey: ["campaigns", cursors[page]],
    queryFn: () => fetchPage(cursors[page]),
    initialData: page === 0 ? initialPage : undefined,
    placeholderData: keepPreviousData,
  });
  return (
    <section aria-labelledby="all-campaigns" className="mt-16">
      <h2 id="all-campaigns" className="text-lg font-semibold tracking-tight">
        All campaigns
      </h2>
      {isError && <p className="mt-4 text-sm text-destructive">Could not load campaigns.</p>}
      {data?.campaigns.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No campaigns yet.</p>}
      <ul className={`mt-4 grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
        {data?.campaigns.map((c) => (
          <li key={c.slug} className="relative">
            <CampaignCard campaign={c} renderedAt={renderedAt} />
          </li>
        ))}
      </ul>
      {(page > 0 || data?.nextCursor) && (
        <nav className="mt-4 flex justify-between" aria-label="Campaign pages">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
            <ChevronLeft aria-hidden /> Previous page
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.nextCursor || isFetching}
            onClick={() => setCursors((c) => [...c, data!.nextCursor])}
          >
            Next page <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </section>
  );
}
