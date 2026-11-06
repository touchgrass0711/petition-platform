import { describe, expect, it } from "vitest";
import { seedCampaigns } from "@/data/seed";
import { confirmationsFor } from "./campaign-confirm";
import { toFormValues } from "./campaign-form";

const now = Date.UTC(2026, 10, 2, 8);
const [live, , scheduled] = seedCampaigns(now);

describe("confirmationsFor", () => {
  it("asks before publishing a new or draft campaign, not when saving a draft", () => {
    const v = { ...toFormValues(null, "UTC", now), status: "published" as const };
    expect(confirmationsFor(null, v, now)).toHaveLength(1);
    expect(confirmationsFor(null, { ...v, status: "draft" }, now)).toEqual([]);
    expect(confirmationsFor({ ...scheduled, status: "draft" }, toFormValues({ ...scheduled, status: "published" }, "UTC", now), now)).toHaveLength(1);
  });
  it("asks before moving the start of a live campaign, and says whether signing closes", () => {
    expect(confirmationsFor(live, toFormValues(live, "UTC", now), now)).toEqual([]);
    const later = { ...toFormValues(live, "UTC", now), startDate: "2026-12-01", startTime: "00:00" };
    expect(confirmationsFor(live, later, now)[0]).toMatch(/closes signing/);
    const earlier = { ...toFormValues(live, "UTC", now), startDate: "2026-01-01", startTime: "00:00" };
    expect(confirmationsFor(live, earlier, now)[0]).toMatch(/keeps it live/);
  });
  it("does not ask for a scheduled campaign's start change", () => {
    const moved = { ...toFormValues(scheduled, "UTC", now), startDate: "2026-12-24" };
    expect(confirmationsFor(scheduled, moved, now)).toEqual([]);
  });
});
