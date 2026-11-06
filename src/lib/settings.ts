import { z } from "zod";

/** Admin capabilities a developer can switch off. Keys are stored in Firestore; labels are UI only. */
export const CAPABILITIES = {
  create: "Create campaigns",
  edit: "Edit campaigns",
  feature: "Feature campaigns",
  delete: "Delete and restore campaigns",
  comments: "Pin comments",
  goal: "Change the petition goal",
  metrics: "View metrics",
  health: "View health counters",
} as const;
export type Capability = keyof typeof CAPABILITIES;
const KEYS = Object.keys(CAPABILITIES) as [Capability, ...Capability[]];

export const MODES = { multiple: "Multiple campaigns", single: "Single campaign" } as const;

export const settingsSchema = z
  .object({ mode: z.enum(["single", "multiple"]), disabled: z.array(z.enum(KEYS)).max(KEYS.length) })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
// Alpha ships as one campaign per deployment; the Master account can switch to multiple in /admin/developer.
export const DEFAULT_SETTINGS: Settings = { mode: "single", disabled: [] };

// Single mode has exactly one campaign: nothing to add, feature or remove.
const MULTIPLE_ONLY: Capability[] = ["create", "feature", "delete"];

/** Why a capability is off, or null when allowed. Mode binds everyone; switches never bind a developer. */
export function blocked(s: Settings, cap: Capability, developer: boolean): string | null {
  if (s.mode === "single" && MULTIPLE_ONLY.includes(cap)) return "Not available in single-campaign mode.";
  if (!developer && s.disabled.includes(cap)) return "Not available for this account.";
  return null;
}
