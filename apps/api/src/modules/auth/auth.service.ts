import bcrypt from "bcryptjs";
import { PrismaClient, RoleType } from "@prisma/client";
import { registerSchema } from "@novoriq/shared";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../lib/http";
import { signToken } from "../../lib/token";
import { toPlain } from "../../lib/serialization";

const defaultWhatsappTemplate =
  "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.";

const defaultFeatureFlags = [
  "v2.staffAccounts",
  "v2.multiDevice",
  "v2.bulkImport",
  "v2.multiBranch",
  "v2.subscriptionBilling"
];

type UserAuthClient = Pick<PrismaClient, "userAuth">;

async function upsertLegacyUserAuth(prisma: UserAuthClient, input: { merchantId: string; userId: string; identifier: string; pinHash: string }) {
  await prisma.userAuth.upsert({
    where: {
      merchantId_identifier: {
        merchantId: input.merchantId,
        identifier: input.identifier
      }
    },
    create: {
      id: randomUUID(),
      merchantId: input.merchantId,
      userId: input.userId,
      identifier: input.identifier,
      pinHash: input.pinHash
    },
    update: {
      userId: input.userId,
      pinHash: input.pinHash,
      updatedAt: new Date(),
      deletedAt: null
    }
  });
}

type RoleClient = Pick<PrismaClient, "role">;

async function ensureRole(tx: RoleClient, merchantId: string, role: RoleType) {
  const key = role;
  const name = role.charAt(0) + role.slice(1).toLowerCase();

  return tx.role.upsert({
    where: {
      merchantId_key: {
        merchantId,
        key
      }
    },
    create: {
      id: randomUUID(),
      merchantId,
      key,
      name,
      description: `${name} role`
    },
    update: {
      name,
      description: `${name} role`,
      updatedAt: new Date(),
      deletedAt: null
    }
  });
}

export async function register(
  prisma: PrismaClient,
  input: unknown,
  deviceId: string
): Promise<{
  token: string;
  merchant: Record<string, unknown>;
  user: Record<string, unknown>;
}> {
  const { businessName, identifier, pin } = registerSchema.parse(input);
  const exists = await prisma.user.findFirst({ where: { identifier, deletedAt: null } });

  if (exists) {
    throw new HttpError(409, "Account already exists for this identifier");
  }

  const now = new Date();
  const merchantId = randomUUID();
  const userId = randomUUID();
  const pinHash = await bcrypt.hash(pin, 10);

  const result = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({
      data: {
        id: merchantId,
        name: businessName,
        phone: identifier.includes("@") ? null : identifier,
        email: identifier.includes("@") ? identifier : null
      }
    });

    const ownerRole = await ensureRole(tx as unknown as RoleClient, merchantId, "OWNER");
    await ensureRole(tx as unknown as RoleClient, merchantId, "MANAGER");
    await ensureRole(tx as unknown as RoleClient, merchantId, "CASHIER");

    const user = await tx.user.create({
      data: {
        id: userId,
        merchantId,
        roleId: ownerRole.id,
        identifier,
        pinHash,
        role: "OWNER",
        isActive: true
      }
    });

    await upsertLegacyUserAuth(tx as unknown as PrismaClient, {
      merchantId,
      userId,
      identifier,
      pinHash
    });

    await tx.device.create({
      data: {
        id: randomUUID(),
        merchantId,
        userId,
        deviceId,
        lastSeenAt: now
      }
    });

    await tx.settings.create({
      data: {
        id: randomUUID(),
        merchantId,
        businessName,
        currencyCode: "USD",
        currencySymbol: "$",
        paymentInstructions: "EcoCash / ZIPIT / Bank transfer / Cash",
        whatsappTemplate: defaultWhatsappTemplate,
        supportPhone: "+263770000000",
        supportEmail: "support@novoriq.com",
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: deviceId
      }
    });

    for (const key of defaultFeatureFlags) {
      await tx.featureFlag.upsert({
        where: { key_merchantId: { key, merchantId } },
        create: { key, merchantId, enabled: false },
        update: {}
      });
    }

    await tx.auditLog.create({
      data: {
        merchantId,
        userId,
        action: "auth.register",
        entityType: "User",
        entityId: userId,
        metadata: { identifier }
      }
    });

    return { merchant, user };
  });

  const token = signToken({
    userId,
    merchantId,
    role: "OWNER",
    identifier,
    deviceId
  });

  return {
    token,
    merchant: toPlain(result.merchant),
    user: toPlain(result.user)
  };
}

export async function login(
  prisma: PrismaClient,
  args: {
    identifier: string;
    pin: string;
    deviceId: string;
  }
): Promise<{
  token: string;
  merchant: Record<string, unknown>;
  user: Record<string, unknown>;
}> {
  const user = await prisma.user.findFirst({
    where: {
      identifier: args.identifier,
      deletedAt: null,
      isActive: true
    },
    include: {
      merchant: true
    }
  });

  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  const isValid = await bcrypt.compare(args.pin, user.pinHash);

  if (!isValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  await prisma.device.upsert({
    where: {
      merchantId_deviceId: {
        merchantId: user.merchantId,
        deviceId: args.deviceId
      }
    },
    create: {
      id: randomUUID(),
      merchantId: user.merchantId,
      userId: user.id,
      deviceId: args.deviceId,
      lastSeenAt: new Date()
    },
    update: {
      userId: user.id,
      lastSeenAt: new Date(),
      revokedAt: null,
      deletedAt: null
    }
  });

  await upsertLegacyUserAuth(prisma, {
    merchantId: user.merchantId,
    userId: user.id,
    identifier: user.identifier,
    pinHash: user.pinHash
  });

  await prisma.auditLog.create({
    data: {
      merchantId: user.merchantId,
      userId: user.id,
      action: "auth.login",
      entityType: "Device",
      metadata: { deviceId: args.deviceId }
    }
  });

  const token = signToken({
    userId: user.id,
    merchantId: user.merchantId,
    role: user.role,
    identifier: user.identifier,
    deviceId: args.deviceId
  });

  return {
    token,
    merchant: toPlain(user.merchant),
    user: toPlain(user)
  };
}

export async function logout(prisma: PrismaClient, merchantId: string, deviceId: string): Promise<void> {
  await prisma.device.updateMany({
    where: { merchantId, deviceId },
    data: { revokedAt: new Date(), updatedAt: new Date() }
  });
}

export async function syncLegacyUserAuth(
  prisma: UserAuthClient,
  input: { merchantId: string; userId: string; identifier: string; pinHash: string }
): Promise<void> {
  await upsertLegacyUserAuth(prisma, input);
}
