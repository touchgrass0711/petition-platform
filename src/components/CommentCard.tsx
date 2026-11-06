import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Comment } from "@/lib/types";
import { SignerAvatar } from "./SignerAvatar";

export function CommentCard({ comment }: { comment: Comment }) {
  return (
    <li className="flex gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40">
      <SignerAvatar name={comment.name} avatarUrl={comment.avatarUrl} preset={comment.avatarPreset} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold">{comment.name}</span>
          <Badge>Signer</Badge>
          {comment.pinned && (
            <Badge>
              <Pin className="size-3" aria-hidden /> Pinned
            </Badge>
          )}
          {/* Relative time drifts between the cached HTML and the client render. */}
          <time className="ml-auto text-xs text-muted-foreground" dateTime={comment.createdAt} suppressHydrationWarning>
            Signed {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </time>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed break-words text-muted-foreground">{comment.message}</p>
      </div>
    </li>
  );
}
