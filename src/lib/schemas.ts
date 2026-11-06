import { z } from "zod";
import { AVATAR_PRESET_HUES, isGooglePhoto, isTinyAvatar } from "@/lib/tiny-avatar";

export const NAME_MAX = 40;
export const MESSAGE_MAX = 500;

export const ANONYMOUS_NAME = "Anonymous";

// Cheap spam signals checked on the client before submit and again on the server.
const messageSchema = z
  .string()
  .trim()
  .min(1, "Comment cannot be blank")
  .max(MESSAGE_MAX, `Comment must be ${MESSAGE_MAX} characters or fewer`)
  .refine((m) => (m.match(/https?:\/\/|www\./gi) ?? []).length <= 1, "Only one link per comment")
  .refine((m) => !/(.)\1{9,}/u.test(m), "Too many repeated characters")
  .refine((m) => {
    const letters = m.replace(/[^a-z]/gi, "");
    return letters.length < 20 || letters !== letters.toUpperCase();
  }, "Please don't write in all caps");

export const commentFieldsSchema = z.object({
  name: z.string().trim().max(NAME_MAX, `Name must be ${NAME_MAX} characters or fewer`),
  message: messageSchema,
  // Checked by default: the public comment then shows only "Anonymous".
  anonymous: z.boolean().default(true),
  // Tiny inline image or the signer's Google photo (src/lib/tiny-avatar.ts); no Storage URLs.
  avatarUrl: z
    .string()
    .refine((v) => isTinyAvatar(v) || isGooglePhoto(v), "Avatar must be a small WebP, PNG or JPEG")
    .nullable()
    .default(null),
  // Colour for the initials avatar when there is no image; null = colour from the name.
  avatarPreset: z.number().int().min(0).max(AVATAR_PRESET_HUES.length - 1).nullable().default(null),
});

type Fields = { name: string; anonymous: boolean };
export const hasName = (v: Fields) => v.anonymous || v.name.length > 0;
export const nameIssue = { message: "Name is required", path: ["name"] };
// The typed name is dropped, not just hidden, when signing anonymously.
const publicName = <T extends Fields>(v: T): T => (v.anonymous ? { ...v, name: ANONYMOUS_NAME } : v);

export const commentInputSchema = commentFieldsSchema.refine(hasName, nameIssue).transform(publicName);

export const commentRequestSchema = commentFieldsSchema
  .extend({
    turnstileToken: z.string().min(1, "Verification required"),
    // Honeypot: hidden from people, filled by naive bots.
    website: z.string().max(200).optional(),
  })
  .refine(hasName, nameIssue)
  .transform(publicName);

export type CommentInput = z.output<typeof commentInputSchema>;
export type CommentRequest = z.output<typeof commentRequestSchema>;

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email"));
export const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const codeRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1, "Verification required"),
});
export const verifyRequestSchema = z.object({ email: emailSchema, code: codeSchema });
