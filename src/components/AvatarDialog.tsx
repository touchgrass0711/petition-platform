"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AVATAR_PRESET_HUES, AVATAR_UPLOADS } from "@/lib/tiny-avatar";
import type { Comment } from "@/lib/types";
import { SignerAvatar } from "./SignerAvatar";

type Choice = { avatarUrl: string | null; avatarPreset: number | null };
type Props = { open: boolean; comment: Comment; photo: string | null; onCancel: () => void; onSave: (c: Comment) => Promise<void> };

const tile = "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50";

/**
 * Pick the avatar explicitly: Google photo, an uploaded image, or initials in a colour.
 * Removing an upload never falls back to the Google photo on its own; the signer chooses.
 */
export function AvatarDialog({ open, comment, photo, onCancel, onSave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [uploaded, setUploaded] = useState<string | null>(
    // The demo's stand-in Google photo is a data URL too, so compare before calling it an upload.
    comment.avatarUrl?.startsWith("data:") && comment.avatarUrl !== photo ? comment.avatarUrl : null,
  );
  const [choice, setChoice] = useState<Choice>({ avatarUrl: comment.avatarUrl, avatarPreset: comment.avatarPreset ?? null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const url = await (await import("@/lib/avatar")).tinyAvatar(file);
      setUploaded(url);
      setChoice({ avatarUrl: url, avatarPreset: null });
    } catch {
      setError("That image could not be read. Try a JPEG or PNG.");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...comment, ...choice });
    } catch (e) {
      setError(e instanceof TypeError ? "Network error. Please try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const option = (key: string, label: string, value: Choice, preview: React.ReactNode) => (
    <label key={key} className={tile}>
      <input
        type="radio"
        name="avatar-choice"
        className="sr-only"
        checked={choice.avatarUrl === value.avatarUrl && (value.avatarUrl !== null || choice.avatarPreset === value.avatarPreset)}
        onChange={() => setChoice(value)}
      />
      {preview}
      <span>{label}</span>
    </label>
  );

  return (
    <dialog ref={ref} aria-labelledby="avatar-title" onCancel={onCancel} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/60">
      <h2 id="avatar-title" className="text-lg font-semibold tracking-tight">Your avatar</h2>
      <fieldset className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <legend className="sr-only">Choose an avatar</legend>
        {photo && option("google", "Google photo", { avatarUrl: photo, avatarPreset: null }, <SignerAvatar name={comment.name} avatarUrl={photo} />)}
        {uploaded && option("uploaded", "Your image", { avatarUrl: uploaded, avatarPreset: null }, <SignerAvatar name={comment.name} avatarUrl={uploaded} />)}
        {option("initials", "Initials", { avatarUrl: null, avatarPreset: null }, <SignerAvatar name={comment.name} avatarUrl={null} />)}
        {AVATAR_PRESET_HUES.map((_, i) =>
          option(`preset-${i}`, `Colour ${i + 1}`, { avatarUrl: null, avatarPreset: i }, <SignerAvatar name={comment.name} avatarUrl={null} preset={i} />),
        )}
      </fieldset>
      {AVATAR_UPLOADS && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
          <ImagePlus className="size-4 shrink-0" aria-hidden />
          {uploaded ? "Upload a different image" : "Upload an image"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={save} disabled={busy}>Save</Button>
      </div>
    </dialog>
  );
}
