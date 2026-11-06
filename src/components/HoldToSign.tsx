"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HOLD_MS, holdProgress, ringFill } from "@/lib/hold";

// Thumbprint: nested open loops around one core, each with its gap turned a little further.
const RINGS = Array.from({ length: 8 }, (_, i) => {
  const rx = 3 + i * 2.6;
  const ry = 4 + i * 3.1;
  const gap = 0.9 - i * 0.05; // radians left open at the bottom
  const a0 = Math.PI / 2 + gap / 2 + i * 0.12;
  const a1 = Math.PI / 2 - gap / 2 + 2 * Math.PI + i * 0.12;
  const pt = (a: number) => `${(24 + rx * Math.cos(a)).toFixed(2)} ${(27 + ry * Math.sin(a)).toFixed(2)}`;
  return `M${pt(a0)}A${rx} ${ry} 0 1 1 ${pt(a1)}`;
});

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

type Props = { onComplete: () => void; disabled?: boolean; busy?: boolean };

/** Press and hold (pointer, touch, or Space/Enter) until the thumbprint fills; releasing early cancels. */
export function HoldToSign({ onComplete, disabled, busy }: Props) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const frame = useRef(0);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    started.current = null;
    setProgress(0);
  };

  const start = () => {
    if (disabled || busy || started.current !== null) return;
    started.current = performance.now();
    const tick = (t: number) => {
      if (started.current === null) return;
      const p = holdProgress(t - started.current, HOLD_MS, reduced);
      setProgress(p);
      if (p >= 1) {
        started.current = null;
        navigator.vibrate?.(30);
        onComplete();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A finished hold stays full while the request runs, then resets.
  useEffect(() => {
    if (!busy) setProgress(0);
  }, [busy]);

  const holding = progress > 0 && progress < 1;
  const release = () => progress < 1 && stop();
  const isKey = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";

  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-describedby="hold-hint"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={release}
      onPointerCancel={stop}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault(); // no click, no page scroll on Space
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => isKey(e) && release()}
      onBlur={release}
      onContextMenu={(e) => e.preventDefault()} // long-press menu on touch
      className={cn(
        "relative flex w-full touch-none select-none items-center gap-3 rounded-md bg-primary px-4 py-3 text-left text-primary-foreground shadow-xs outline-none [-webkit-touch-callout:none]",
        "transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <svg viewBox="0 0 48 54" className="size-11 shrink-0" aria-hidden fill="none" strokeLinecap="round" strokeWidth={1.6}>
        {RINGS.map((d, i) => (
          <g key={i}>
            <path d={d} stroke="currentColor" strokeOpacity={0.25} />
            <path d={d} stroke="currentColor" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ringFill(progress, i, RINGS.length)} />
          </g>
        ))}
      </svg>
      <span className="flex flex-col">
        <span className="text-base font-semibold">{busy ? "Signing…" : "Leaving Thumbprint"}</span>
        <span id="hold-hint" className="text-xs opacity-80">
          {busy ? "Saving your signature" : holding ? "Keep holding…" : "Press and hold to sign"}
        </span>
      </span>
      {busy && <Loader2 className="ml-auto size-4 animate-spin" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {holding ? "Keep holding" : ""}
      </span>
    </button>
  );
}
