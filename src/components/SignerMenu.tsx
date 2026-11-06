"use client";

import { CircleUserRound, LogOut, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DEMO_MODE } from "@/lib/demo";
import { ANONYMOUS_NAME, MESSAGE_MAX, NAME_MAX, commentInputSchema } from "@/lib/schemas";
import type { Comment } from "@/lib/types";
import { AvatarDialog } from "./AvatarDialog";
import { SignerAvatar } from "./SignerAvatar";

type Props = {
  email: string;
  /** Google profile photo, when signed in with Google. */
  photo: string | null;
  /** This signer's signature on the current campaign, when this view has it. */
  comment?: Comment | null;
  /** Rejects with a message the signer can read; the dialog stays open. */
  onEdit: (comment: Comment) => Promise<void>;
  onDelete: () => Promise<void>;
  onSignOut: () => void;
};

const item = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/** Avatar button with a menu below it. Native popover: light dismiss, Escape and focus return come from the browser. */
export function SignerMenu({ email, photo, comment, onEdit, onDelete, onSignOut }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // Before signing there is no comment yet, so the Google photo (if any) stands in.
  const avatar = comment ? { avatarUrl: comment.avatarUrl, preset: comment.avatarPreset } : { avatarUrl: photo, preset: null };
  const canChange = !!comment;

  // Top layer has no anchor in all browsers yet, so place the menu under the avatar when it opens.
  function place(e: React.ToggleEvent<HTMLDivElement>) {
    if (e.newState !== "open" || !button.current || !menu.current) return;
    const r = button.current.getBoundingClientRect();
    menu.current.style.top = `${r.bottom + 8}px`;
    menu.current.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }
  const run = (fn: () => void) => () => {
    menu.current?.hidePopover();
    fn();
  };

  return (
    <>
      <button ref={button} type="button" popoverTarget="signer-menu" aria-label="Your signature and account" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <SignerAvatar name={email} {...avatar} />
      </button>
      <div ref={menu} id="signer-menu" popover="auto" onToggle={place} className="fixed inset-auto m-0 w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
        <div className="flex items-center gap-3 border-b px-2 pb-3 pt-1">
          <SignerAvatar name={email} {...avatar} />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{comment && comment.name !== ANONYMOUS_NAME ? comment.name : "Signed in"}</p>
            <p className="truncate text-muted-foreground">{email}</p>
          </div>
        </div>
        <div className="pt-2">
          {canChange && (
            <>
              <button type="button" className={item} onClick={run(() => setEditing(true))}>
                <Pencil className="size-4" aria-hidden /> Edit my signature
              </button>
              <button type="button" className={item} onClick={run(() => setChoosing(true))}>
                <CircleUserRound className="size-4" aria-hidden /> Change avatar
              </button>
              <button type="button" className={`${item} text-destructive`} onClick={run(() => setDeleting(true))}>
                <Trash2 className="size-4" aria-hidden /> Delete my signature
              </button>
            </>
          )}
          <button type="button" className={item} onClick={run(onSignOut)}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>
      {comment && <EditDialog key={comment.id} open={editing} comment={comment} onCancel={() => setEditing(false)} onSave={async (c) => (await onEdit(c), setEditing(false))} />}
      {comment && (
        <AvatarDialog key={`${comment.id}-${choosing}`} open={choosing} comment={comment} photo={photo} onCancel={() => setChoosing(false)} onSave={async (c) => (await onEdit(c), setChoosing(false))} />
      )}
      <ConfirmDialog open={deleting} title="Delete your signature?" confirmLabel="Delete" destructive onCancel={() => setDeleting(false)} onConfirm={() => {
          setDeleting(false);
          onDelete().catch((e: Error) => toast.error(e.message));
        }}>
        <p>Your signature and comment are removed and the count goes down by one. You can sign again later.</p>
        {DEMO_MODE && <p>Demo Mode: nothing is saved.</p>}
      </ConfirmDialog>
    </>
  );
}

function EditDialog({ open, comment, onCancel, onSave }: { open: boolean; comment: Comment; onCancel: () => void; onSave: (c: Comment) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [anonymous, setAnonymous] = useState(comment.name === ANONYMOUS_NAME);
  const [name, setName] = useState(anonymous ? "" : comment.name);
  const [message, setMessage] = useState(comment.message);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Same rules as signing (spam checks, name or Anonymous).
    const parsed = commentInputSchema.safeParse({ name, message, anonymous, avatarUrl: comment.avatarUrl, avatarPreset: comment.avatarPreset ?? null });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    setBusy(true);
    try {
      await onSave({ ...comment, name: parsed.data.name, message: parsed.data.message });
    } catch (err) {
      setError(err instanceof TypeError ? "Network error. Please try again." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="edit-title" onCancel={onCancel} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/60">
      <form onSubmit={save} className="space-y-4" noValidate>
        <h2 id="edit-title" className="text-lg font-semibold tracking-tight">Edit your signature</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          Show as Anonymous
        </label>
        {!anonymous && (
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="edit-message">Comment</Label>
          <Textarea id="edit-message" rows={3} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save</Button>
        </div>
      </form>
    </dialog>
  );
}
