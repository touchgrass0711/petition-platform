import { z } from "zod";
import { isIanaZone, MILESTONES_MAX, wallClockToUtc, type RichTextNode } from "./campaign";

export const DESCRIPTION_MAX_BYTES = 50_000;
const DEPTH_MAX = 20;
const GOAL_MAX = 100_000_000;

// Tiptap StarterKit only. Anything else is rejected, so stored descriptions can only hold these.
const NODE_TYPES = [
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem",
  "blockquote", "codeBlock", "hardBreak", "horizontalRule",
] as const;
const PLAIN_MARKS = ["bold", "italic", "strike", "code", "underline"] as const;
const LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

const safeHref = z
  .string()
  .max(2048)
  .refine((href) => {
    try {
      return LINK_PROTOCOLS.has(new URL(href).protocol);
    } catch {
      return false;
    }
  }, "Links must start with https:, http: or mailto:");

// Unknown keys are stripped (zod default), so attributes like `class`, `style` or `onclick` never get stored.
const mark = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link"), attrs: z.object({ href: safeHref }) }),
  z.object({ type: z.enum(PLAIN_MARKS) }),
]);

const attrs = z.object({
  level: z.number().int().min(1).max(4).optional(),
  start: z.number().int().min(1).max(10_000).optional(),
  language: z.string().regex(/^[\w+-]{1,32}$/).nullable().optional(),
});

type ParsedNode = Omit<RichTextNode, "type"> & { type: (typeof NODE_TYPES)[number] };

const node: z.ZodType<ParsedNode> = z.object({
  type: z.enum(NODE_TYPES),
  attrs: attrs.optional(),
  marks: z.array(mark).max(10).optional(),
  text: z.string().max(10_000).optional(),
  get content() {
    return z.array(node).max(2_000).optional();
  },
});

// Size and depth are checked before the recursive parse so hostile input can't exhaust the stack.
function depth(n: unknown, d = 0): number {
  if (d > DEPTH_MAX || typeof n !== "object" || n === null) return d;
  const content = (n as { content?: unknown }).content;
  return Array.isArray(content) ? Math.max(d, ...content.map((c) => depth(c, d + 1))) : d;
}

export const richTextDocSchema = z
  .unknown()
  .refine((v) => new TextEncoder().encode(JSON.stringify(v ?? null)).length <= DESCRIPTION_MAX_BYTES, "Description is too long")
  .refine((v) => depth(v) <= DEPTH_MAX, "Description is nested too deeply")
  .pipe(node)
  .refine((n) => n.type === "doc", "Description must be a document");

const BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock"]);

/** Plain text for OG tags, list excerpts and search. */
export function docToText(doc: RichTextNode): string {
  const parts: string[] = [];
  const walk = (n: RichTextNode) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.type === "hardBreak") parts.push("\n");
    n.content?.forEach(walk);
    if (BLOCKS.has(n.type)) parts.push("\n");
  };
  walk(doc);
  return parts.join("").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/, "3–60 lowercase letters, digits or dashes; no dash at either end");

const milestone = z.object({
  count: z.number().int().min(1).max(GOAL_MAX),
  label: z.string().trim().max(80).default(""),
});
// Wall-clock time in the campaign's zone, e.g. "2026-11-10T19:00".
const localDateTime = z.iso.datetime({ local: true });

// Zod 4 runs object refinements even when a field already failed, so malformed dates must not throw here.
function endAfterStart(start: string, end: string, timeZone: string) {
  try {
    return wallClockToUtc(end, timeZone) > wallClockToUtc(start, timeZone);
  } catch {
    return true; // the field's own issue already reports it
  }
}

export const campaignInputSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(1, "Title is required").max(120),
    subtitle: z.string().trim().max(200).default(""),
    description: richTextDocSchema,
    goal: z.number().int().min(1).max(GOAL_MAX),
    milestones: z.array(milestone).max(MILESTONES_MAX).default([]),
    start: localDateTime,
    end: localDateTime.nullable(), // null = Indefinitely
    timeZone: z.string().refine(isIanaZone, "Unknown time zone"),
    status: z.enum(["draft", "published"]).default("draft"),
  })
  .refine((v) => v.end === null || endAfterStart(v.start, v.end, v.timeZone), {
    path: ["end"],
    message: "End must be after start",
  })
  .refine((v) => v.milestones.every((m) => m.count <= v.goal), { path: ["milestones"], message: "Milestones can't exceed the goal" })
  .refine((v) => v.milestones.every((m, i, a) => i === 0 || m.count > a[i - 1].count), {
    path: ["milestones"],
    message: "Milestones must be ascending and unique",
  });

export type CampaignInput = z.output<typeof campaignInputSchema>;
