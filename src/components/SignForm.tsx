"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile } from "@marsidev/react-turnstile";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { HoldToSign } from "@/components/HoldToSign";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { DEMO_MODE } from "@/lib/demo";
import { liveIdToken } from "@/lib/my-signature";
import { commentFieldsSchema, MESSAGE_MAX, NAME_MAX, hasName, nameIssue } from "@/lib/schemas";
import { AVATAR_UPLOADS } from "@/lib/tiny-avatar";
import { usePublicConfig } from "@/app/providers";
import type { Comment } from "@/lib/types";

const formSchema = commentFieldsSchema.omit({ avatarUrl: true, avatarPreset: true }).extend({ anonymous: z.boolean(), website: z.string() }).refine(hasName, nameIssue);
type FormValues = z.infer<typeof formSchema>;


type Props = { campaign: string; email: string; photo: string | null; onSigned: (comment: Comment) => void; menu: ReactNode };

export function SignForm({ campaign, email, photo, onSigned, menu }: Props) {
  const { turnstileSiteKey } = usePublicConfig();
  const [token, setToken] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", message: "", anonymous: true, website: "" },
  });
  const { errors, isSubmitting } = formState;
  const anonymous = watch("anonymous");

  async function onSubmit(values: FormValues) {
    setStatus(null);
    try {
      // Loaded on demand so the compressor stays out of the first page load.
      // A chosen image wins; otherwise the Google photo, if signed in with Google. Changeable later from the menu.
      const avatarUrl = avatar ? await (await import("@/lib/avatar")).tinyAvatar(avatar) : photo;
      // Live mode: the API checks this Firebase ID token and allows one signature per account.
      const idToken = DEMO_MODE ? null : await liveIdToken();
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken && { Authorization: `Bearer ${idToken}` }) },
        body: JSON.stringify({ ...values, avatarUrl, turnstileToken: token, campaign }),
      });
      const body = await res.json();
      if (!res.ok) return setStatus(body.error ?? "Something went wrong.");
      track("signed");
      // The parent swaps this form for the share card, so there is nothing to reset.
      onSigned(body.comment);
    } catch {
      setStatus("Network error. Please try again.");
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="text-xl">Sign the petition</CardTitle>
          <CardDescription className="truncate">
            Signed in as <span className="text-foreground">{email}</span>
          </CardDescription>
        </div>
        {menu}
      </CardHeader>
      <CardContent>
        {/* Only the hold button signs; Enter in a field must not submit around it. */}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4" noValidate>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" {...register("anonymous")} />
            <span>
              Send as Anonymous
              <span className="block text-xs text-muted-foreground">Anonymous to the public, not to the organiser.</span>
            </span>
          </label>
          {!anonymous && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" maxLength={NAME_MAX} placeholder="Your name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          )}
          {/* Honeypot: off-screen and skipped by keyboard and screen readers; only bots fill it. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Comment</Label>
            <Textarea id="message" rows={3} maxLength={MESSAGE_MAX} placeholder="Why are you signing?" aria-invalid={!!errors.message} {...register("message")} />
            {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
          </div>
          {AVATAR_UPLOADS && (
            <div className="space-y-2">
              <Label htmlFor="avatar">Avatar (optional)</Label>
              <label
                htmlFor="avatar"
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
              >
                <ImagePlus className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{avatar ? avatar.name : "Choose an image"}</span>
                <input id="avatar" type="file" accept="image/*" className="sr-only" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
              </label>
              {photo && !avatar && <p className="text-xs text-muted-foreground">Your Google photo is used unless you choose an image.</p>}
            </div>
          )}
          <Turnstile siteKey={turnstileSiteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ size: "flexible" }} />
          <p className="text-xs text-muted-foreground">
            By signing you confirm you are 13 or older and agree that your comment, photo and name (unless you sign anonymously) are
            shown publicly, delivered to the petition&apos;s recipients and processed by our service providers. See our{" "}
            <Link href="/privacy" className="underline">
              privacy notice
            </Link>
            .
          </p>
          <HoldToSign onComplete={handleSubmit(onSubmit)} disabled={!token} busy={isSubmitting} />
          {status && <p role="status" className="text-center text-sm text-muted-foreground">{status}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
