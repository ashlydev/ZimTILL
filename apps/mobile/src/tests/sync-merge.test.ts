import { describe, expect, it } from "@jest/globals";
import { shouldApplyServerChange } from "../data/sync-utils";

describe("sync merge behavior", () => {
  it("applies server row when local row is missing", () => {
    expect(shouldApplyServerChange(null, "2026-03-05T10:00:00.000Z")).toBe(true);
  });

  it("applies server row when server updatedAt is newer", () => {
    expect(shouldApplyServerChange("2026-03-05T09:00:00.000Z", "2026-03-05T10:00:00.000Z")).toBe(true);
  });

  it("keeps local row when local updatedAt is newer", () => {
    expect(shouldApplyServerChange("2026-03-05T10:00:00.000Z", "2026-03-05T09:00:00.000Z")).toBe(false);
  });
});
