"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Eye, EyeOff, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { commentFilters, MAX_PINNED, type CommentFilter, type Moderation } from "@/lib/comment-moderation";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import type { CommentPage } from "@/lib/petition";
import type { Comment } from "@/lib/types";
import { useAdminSession } from "./AdminGate";

const label: Record<CommentFilter, string> = { all: "All", pinned: "Pinned", hidden: "Hidden" };

/** Comments of one campaign: filter, pin (capped), hide. Demo Mode shows the toast instead of calling the API. */
export function CommentModeration({ slug }: { slug: string }) {
  const session = useAdminSession();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<CommentFilter>("all");
  // cursors[i] loads page i of the "all" list; page 0 has none.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1)!;

  const comments = useQuery({
    queryKey: ["admin-comments", slug, filter, cursor],
    queryFn: () =>
      adminApi<CommentPage>(session, `/api/admin/campaigns/${slug}/comments?${new URLSearchParams({ filter, ...(cursor && { cursor }) })}`),
    placeholderData: keepPreviousData,
  });

  async function moderate(c: Comment, change: Moderation, success: string) {
    if (DEMO_MODE) return void toast(DEMO_DISABLED_MESSAGE);
    try {
      await adminApi(session, `/api/admin/campaigns/${slug}/comments/${c.id}`, { method: "PATCH", body: JSON.stringify(change) });
      toast.success(success);
      await qc.invalidateQueries({ queryKey: ["admin-comments", slug] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pick = (f: CommentFilter) => {
    setFilter(f);
    setCursors([null]);
  };

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>
          Up to {MAX_PINNED} pinned comments stay at the top of this campaign. Hidden comments are kept but never shown publicly.
        </CardDescription>
        <div role="group" aria-label="Filter comments" className="flex gap-2 pt-2">
          {commentFilters.map((f) => (
            <Button key={f} size="sm" variant={f === filter ? "default" : "outline"} aria-pressed={f === filter} onClick={() => pick(f)}>
              {label[f]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <div className={`relative overflow-x-auto transition-opacity ${comments.isFetching ? "opacity-60" : ""}`}>
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-6">Signer</th>
              <th className="px-4 py-3 font-medium sm:px-6">Comment</th>
              <th className="hidden px-4 py-3 font-medium whitespace-nowrap sm:table-cell sm:px-6">Signed</th>
              <th className="px-4 py-3 text-right font-medium sm:px-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {comments.isError && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-destructive">Could not load comments.</td>
              </tr>
            )}
            {comments.data?.comments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-muted-foreground">No comments here.</td>
              </tr>
            )}
            {comments.data?.comments.map((c) => (
              <tr key={c.id} className={`transition-colors hover:bg-muted/40 ${c.hidden ? "opacity-60" : ""}`}>
                <td className="px-4 py-3 font-medium sm:px-6 sm:whitespace-nowrap">
                  {c.name}
                  {c.pinned && <Badge className="ml-2">Pinned</Badge>}
                  {c.hidden && <Badge className="ml-2">Hidden</Badge>}
                </td>
                <td className="max-w-md px-4 py-3 break-words text-muted-foreground sm:px-6">{c.message}</td>
                <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground sm:table-cell sm:px-6">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap sm:px-6">
                  <div className="inline-flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={c.hidden}
                      aria-label={c.pinned ? `Unpin comment by ${c.name}` : `Pin comment by ${c.name}`}
                      onClick={() => moderate(c, { pinned: !c.pinned }, c.pinned ? "Unpinned" : "Pinned")}
                    >
                      {c.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={c.hidden ? `Show comment by ${c.name}` : `Hide comment by ${c.name}`}
                      onClick={() => moderate(c, { hidden: !c.hidden }, c.hidden ? "Shown" : "Hidden")}
                    >
                      {c.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filter === "all" && (
        <nav className="flex justify-between px-4 py-3 sm:px-6" aria-label="Comment pages">
          <Button variant="outline" size="sm" disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
            Previous page
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!comments.data?.nextCursor || comments.isFetching}
            onClick={() => setCursors((c) => [...c, comments.data!.nextCursor])}
          >
            Next page
          </Button>
        </nav>
      )}
    </Card>
  );
}
