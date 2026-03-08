import { describe, expect, it } from "@jest/globals";
import { mergePulledRows, shouldApplyServerChange } from "../data/sync-utils";

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

  it("prefers server row when timestamps match", () => {
    const merged = mergePulledRows(
      [{ id: "order-1", updatedAt: "2026-03-05T10:00:00.000Z", total: 10 }],
      [{ id: "order-1", updatedAt: "2026-03-05T10:00:00.000Z", total: 12 }]
    );

    expect(merged[0]?.total).toBe(12);
  });
});
