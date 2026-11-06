import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "@/lib/settings";

// config/ has no Firestore rule, so only the server can read or write it.
const ref = () => adminDb().collection("config").doc("settings");

/** Developer settings, cached until the next save. A missing or malformed doc means defaults (everything on). */
export const getSettings = unstable_cache(
  async (): Promise<Settings> => {
    if (!isFirebaseAdminConfigured) return DEFAULT_SETTINGS;
    const parsed = settingsSchema.safeParse((await ref().get()).data());
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  },
  ["settings"],
  { tags: ["settings"] },
);

export async function saveSettings(s: Settings): Promise<void> {
  await ref().set(s);
  revalidateTag("settings");
  // Mode changes what / and /c/[slug] render.
  revalidatePath("/");
  revalidatePath("/c/[slug]", "page");
}
