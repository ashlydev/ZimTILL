import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn()
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    subscription: {
      findFirst
    }
  }
}));

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

async function runMiddleware(role: UserShape["role"], permission: Parameters<typeof requirePermission>[0]) {
  const middleware = requirePermission(permission);
  const json = vi.fn();
  const res = {
    status: vi.fn(() => ({ json }))
  };
  const next = vi.fn();

  await middleware(
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
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue({
      status: "ACTIVE",
      billingPeriodEnd: new Date(Date.now() + 86_400_000),
      plan: null
    });
  });

  it("allows a cashier through product write routes", async () => {
    const result = await runMiddleware("CASHIER", "products.write");

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
  });

  it("allows an owner through billing routes", async () => {
    const result = await runMiddleware("OWNER", "billing.manage");

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
  });
});
