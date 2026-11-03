import { describe, expect, it } from "vitest";
import { latestSigners } from "./ProgressBar";

const c = (id: string, createdAt: string, pinned = false) => ({ id, name: id, message: "", avatarUrl: null, pinned, createdAt });

describe("latestSigners", () => {
  it("takes the newest three regardless of pinning", () => {
    const list = [c("old-pin", "2026-01-01T00:00:00Z", true), c("b", "2026-03-01T00:00:00Z"), c("a", "2026-04-01T00:00:00Z"), c("z", "2026-02-01T00:00:00Z")];
    expect(latestSigners(list).map((x) => x.id)).toEqual(["a", "b", "z"]);
  });
});
