import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { signToken } from "../lib/token";

function createResponse() {
  const json = vi.fn();
  return {
    json,
    status: vi.fn(() => ({ json }))
  };
}

describe("requirePlatformAdmin", () => {
  beforeEach(() => {
    env.PLATFORM_ADMIN_EMAIL = "platform-admin@example.com";
    env.PLATFORM_ADMIN_PASSWORD = "secret";
  });

  it("rejects merchant owner tokens", async () => {
    const token = signToken({
      userId: "user-1",
      merchantId: "merchant-1",
      role: "OWNER",
      identifier: "owner@example.com",
      deviceId: "device-1",
      branchId: "branch-1",
      platformAccess: false
    });
    const res = createResponse();
    const next = vi.fn();

    await requirePlatformAdmin(
      {
        headers: { authorization: `Bearer ${token}` }
      } as never,
      res as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Platform admin access required" });
  });

  it("accepts the dedicated platform-admin token", async () => {
    const token = signToken({
      userId: "platform-admin",
      merchantId: "platform-admin",
      role: "ADMIN",
      identifier: env.PLATFORM_ADMIN_EMAIL,
      deviceId: "platform-admin",
      branchId: null,
      platformAccess: true,
      scope: "platform_admin",
      email: env.PLATFORM_ADMIN_EMAIL
    });
    const req = {
      headers: { authorization: `Bearer ${token}` }
    } as never;
    const res = createResponse();
    const next = vi.fn();

    await requirePlatformAdmin(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as never as { platformAdmin?: { email: string } }).platformAdmin?.email).toBe(env.PLATFORM_ADMIN_EMAIL);
    expect(res.status).not.toHaveBeenCalled();
  });
});
