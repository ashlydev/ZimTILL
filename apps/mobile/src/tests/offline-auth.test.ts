import { createHash } from "crypto";
import { describe, expect, it } from "@jest/globals";
import {
  createOfflineAuthRecord,
  normalizeIdentifier,
  parseOfflineAuthStore,
  sha256Hex,
  upsertOfflineAuthRecord,
  verifyOfflinePin
} from "../utils/offlineAuth";

describe("offline auth helpers", () => {
  it("matches the standard sha256 digest", () => {
    expect(sha256Hex("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("normalizes phone numbers and email consistently", () => {
    expect(normalizeIdentifier("  Admin@Example.com ")).toBe("admin@example.com");
    expect(normalizeIdentifier(" +263 77 123 4567 ")).toBe("+263771234567");
  });

  it("creates and verifies an offline credential record", () => {
    const session = {
      token: "token-1",
      merchantId: "merchant-1",
      userId: "user-1",
      identifier: "+263771234567",
      role: "OWNER" as const,
      businessName: "ZimTILL",
      deviceId: "device-1",
      activeBranchId: "branch-1"
    };

    const record = createOfflineAuthRecord(session, " +263 77 123 4567 ", "1234");

    expect(record.identifier).toBe("+263771234567");
    expect(verifyOfflinePin(record, "+263771234567", "1234", "device-1")).toBe(true);
    expect(verifyOfflinePin(record, "+263771234567", "9999", "device-1")).toBe(false);
  });

  it("keeps the latest record for the same identifier", () => {
    const baseSession = {
      token: "token-1",
      merchantId: "merchant-1",
      userId: "user-1",
      identifier: "cashier@example.com",
      role: "CASHIER" as const,
      businessName: "ZimTILL",
      deviceId: "device-1",
      activeBranchId: "branch-1"
    };

    const first = createOfflineAuthRecord(baseSession, "cashier@example.com", "1234");
    const second = createOfflineAuthRecord({ ...baseSession, token: "token-2" }, "cashier@example.com", "5678");
    const records = upsertOfflineAuthRecord([first], second);

    expect(records).toHaveLength(1);
    expect(records[0]?.session.token).toBe("token-2");
  });

  it("ignores malformed secure-store payloads", () => {
    expect(parseOfflineAuthStore(null).records).toHaveLength(0);
    expect(parseOfflineAuthStore("{\"records\":\"bad\"}").records).toHaveLength(0);
  });
});
