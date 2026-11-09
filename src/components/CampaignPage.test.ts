import { describe, expect, it } from "vitest";
import { seedCampaigns } from "@/data/seed";
import { campaignJsonLd } from "./CampaignPage";

describe("campaignJsonLd", () => {
  it("escapes < so campaign text can't end the script tag", () => {
    const c = { ...seedCampaigns()[0], title: "</script><script>alert(1)</script>" };
    const out = campaignJsonLd(c, "https://example.com/c/x");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe(c.title);
  });
});
