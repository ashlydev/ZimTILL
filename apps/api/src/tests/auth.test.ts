import { describe, expect, it } from "vitest";
import { login, register } from "../modules/auth/auth.service";
import { createInMemoryPrisma } from "./inMemoryPrisma";

describe("auth service", () => {
  it("registers and logs in a merchant owner", async () => {
    const { prisma } = createInMemoryPrisma();

    const registerResult = await register(
      prisma as never,
      {
        businessName: "Acme Store",
        identifier: "+263771111111",
        pin: "1234"
      },
      "device-1"
    );

    expect(registerResult.token).toBeTruthy();
    expect(registerResult.merchant.name).toBe("Acme Store");

    const loginResult = await login(prisma as never, {
      identifier: "+263771111111",
      pin: "1234",
      deviceId: "device-1"
    });

    expect(loginResult.token).toBeTruthy();
    expect(loginResult.user.identifier).toBe("+263771111111");
  });
});
