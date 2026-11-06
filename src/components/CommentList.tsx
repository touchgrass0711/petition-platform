"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CommentPage } from "@/lib/petition";
import type { Comment } from "@/lib/types";
import { CommentCard } from "./CommentCard";

async function fetchPage(campaign: string, cursor: string | null): Promise<CommentPage> {
  const q = new URLSearchParams({ campaign, ...(cursor && { cursor }) });
  const res = await fetch(`/api/comments?${q}`);
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json();
}

type Props = { campaign: string; initialPage: CommentPage; prepend?: Comment[] };

export function CommentList({ campaign, initialPage, prepend = [] }: Props) {
  // cursors[i] is the cursor that loads page i; page 0 has none.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const page = cursors.length - 1;
  const cursor = cursors[page];

  const { data, isFetching, isError } = useQuery({
    queryKey: ["comments", campaign, cursor],
    queryFn: () => fetchPage(campaign, cursor),
    initialData: page === 0 ? initialPage : undefined,
    placeholderData: keepPreviousData,
  });

  return (
    <section aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="text-lg font-semibold tracking-tight">
        Recent signers
      </h2>
      {isError && <p className="mt-4 text-sm text-destructive">Could not load comments.</p>}
      {!isFetching && page === 0 && prepend.length === 0 && data?.comments.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No signatures yet.</p>
      )}
      <ul className={`mt-4 space-y-3 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
        {[...(page === 0 ? prepend : []), ...(data?.comments ?? [])].map((c) => (
          <CommentCard key={c.id} comment={c} />
        ))}
      </ul>
      <nav className="mt-4 flex justify-between" aria-label="Comment pages">
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
    </section>
  );
}
