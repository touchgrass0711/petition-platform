"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** When set, the confirm button stays disabled until this exact text is typed (GitHub-style). */
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Native <dialog> + showModal(): focus trap, Escape, inert background and top layer come from the browser.
export function ConfirmDialog({ open, title, children, confirmLabel, destructive, typeToConfirm, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTyped("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  const ready = !typeToConfirm || typed === typeToConfirm;
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={onCancel}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-black/60"
    >
      <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
      {typeToConfirm && (
        <div className="mt-4 grid gap-2">
          <Label htmlFor="confirm-text">
            Type <span className="font-mono text-foreground">{typeToConfirm}</span> to confirm
          </Label>
          <Input id="confirm-text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button
          disabled={!ready}
          className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
