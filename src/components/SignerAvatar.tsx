import { AVATAR_PRESET_HUES } from "@/lib/tiny-avatar";

/** Up to two initials from a display name; "?" when it has no letters or digits. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const picked = words.length > 1 ? [words[0], words.at(-1)!] : words;
  return picked.map((w) => [...w.replace(/[^\p{L}\p{N}]/gu, "")][0]).join("").toUpperCase() || "?";
}

/** Stable hue (0-359) for a name, so a signer keeps the same colour on every render. */
export function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

/** Uploaded photo, else a locally drawn initials avatar (no third-party request, so no CSP or privacy cost). */
type Props = { name: string; avatarUrl: string | null; preset?: number | null };

export function SignerAvatar({ name, avatarUrl, preset }: Props) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- ~50KB avatars from Storage; no optimisation needed
    return <img src={avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border" />;
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden className="size-10 shrink-0 rounded-full ring-1 ring-border">
      <rect width="40" height="40" fill={`oklch(0.45 0.12 ${preset != null ? (AVATAR_PRESET_HUES[preset] ?? hue(name)) : hue(name)})`} />
      <text x="20" y="20" dy="0.35em" textAnchor="middle" fill="white" fontSize="15" fontWeight="600">
        {initials(name)}
      </text>
    </svg>
  );
}
