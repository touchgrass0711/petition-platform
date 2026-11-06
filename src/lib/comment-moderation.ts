import { z } from "zod";

/** Few pins keep them meaningful; the public list shows pinned comments first. */
export const MAX_PINNED = 3;

export const moderationSchema = z.union([z.object({ pinned: z.boolean() }).strict(), z.object({ hidden: z.boolean() }).strict()]);
export type Moderation = z.infer<typeof moderationSchema>;

export const commentFilters = ["all", "pinned", "hidden"] as const;
export type CommentFilter = (typeof commentFilters)[number];

type Flags = { pinned: boolean; hidden: boolean };

/** New flags for a comment, or an error message. Hiding also unpins; a hidden comment can't be pinned. */
export function applyModeration(current: Flags, change: Moderation, otherPinned: number): Flags | string {
  if ("hidden" in change) return { hidden: change.hidden, pinned: change.hidden ? false : current.pinned };
  if (!change.pinned) return { ...current, pinned: false };
  if (current.hidden) return "Unhide the comment before pinning it.";
  if (otherPinned >= MAX_PINNED) return `At most ${MAX_PINNED} pinned comments per campaign. Unpin one first.`;
  return { ...current, pinned: true };
}
