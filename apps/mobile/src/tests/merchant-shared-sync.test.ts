import { describe, expect, it } from "@jest/globals";
import { createOutboxOperation, mergePulledRows } from "../data/sync-utils";

describe("merchant-shared sync visibility", () => {
  it("keeps staff mutation merchant-scoped and visible on owner pull", () => {
    const staffOrder = {
      id: "order-1",
      merchantId: "merchant-1",
      createdByUserId: "staff-1",
      updatedByUserId: "staff-1",
      lastModifiedByDeviceId: "device-staff",
      updatedAt: "2026-03-08T12:00:00.000Z",
      total: 25
    };

    const op = createOutboxOperation("order", staffOrder.id, "UPSERT", staffOrder, {
      userId: "staff-1",
      deviceId: "device-staff"
    });

    const ownerRows = mergePulledRows([], [staffOrder]);

    expect(op.userId).toBe("staff-1");
    expect(op.deviceId).toBe("device-staff");
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]?.merchantId).toBe("merchant-1");
    expect(ownerRows[0]?.createdByUserId).toBe("staff-1");
  });
});
