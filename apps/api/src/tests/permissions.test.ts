import { describe, expect, it, vi } from "vitest";
import { requirePermission } from "../middleware/permissions";

type UserShape = {
  role: "OWNER" | "CASHIER";
  merchantId: string;
  userId: string;
  identifier: string;
  deviceId: string;
  branchId: string | null;
  platformAccess: boolean;
};

function runMiddleware(role: UserShape["role"], permission: Parameters<typeof requirePermission>[0]) {
  const middleware = requirePermission(permission);
  const json = vi.fn();
  const res = {
    status: vi.fn(() => ({ json }))
  };
  const next = vi.fn();

  middleware(
    {
      user: {
        role,
        merchantId: "merchant-1",
        userId: "user-1",
        identifier: role === "OWNER" ? "owner@example.com" : "+263771111111",
        deviceId: "device-1",
        branchId: "branch-1",
        platformAccess: role === "OWNER"
      }
    } as never,
    res as never,
    next
  );

  return { res, json, next };
}

describe("permission middleware", () => {
  it("blocks a cashier from product write routes", () => {
    const result = runMiddleware("CASHIER", "products.write");

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({ message: "Forbidden: missing permission" });
  });

  it("allows an owner through billing routes", () => {
    const result = runMiddleware("OWNER", "billing.manage");

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
  });
});
