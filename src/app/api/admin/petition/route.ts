import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { adminDb, petitionId } from "@/lib/firebase/admin";
import { guard } from "@/lib/server/admin-auth";

const body = z.object({ goal: z.number().int().min(1).max(100_000_000) });

export async function PATCH(req: Request) {
  const denied = await guard(req, "goal");
  if (denied) return denied;
  if (DEMO_MODE) return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
  await adminDb().collection("petitions").doc(petitionId()).update(parsed.data);
  revalidatePath("/"); // don't make the owner wait 24h for their own change
  return NextResponse.json(parsed.data);
}
