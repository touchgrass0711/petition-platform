import { describe, expect, it } from "vitest";
import { campaignFromPath } from "./analytics";

describe("campaignFromPath", () => {
  it("reads the slug from campaign pages only", () => {
    expect(campaignFromPath("/c/save-the-park")).toBe("save-the-park");
    expect(campaignFromPath("/c/save-the-park/")).toBe("save-the-park");
    expect(campaignFromPath("/")).toBeNull();
    expect(campaignFromPath("/admin/campaigns")).toBeNull();
  });
});
