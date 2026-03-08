import { describe, expect, it } from "@jest/globals";
import { createOutboxOperation } from "../data/sync-utils";

describe("outbox enqueue", () => {
  it("creates operation with required sync fields", () => {
    const op = createOutboxOperation("product", "entity-1", "UPSERT", { id: "entity-1", name: "Bread" }, {
      userId: "user-1",
      deviceId: "device-1"
    });

    expect(op.id).toBeTruthy();
    expect(op.opId).toBeTruthy();
    expect(op.entityType).toBe("product");
    expect(op.opType).toBe("UPSERT");
    expect(op.payload.name).toBe("Bread");
    expect(op.userId).toBe("user-1");
    expect(op.deviceId).toBe("device-1");
  });
});
