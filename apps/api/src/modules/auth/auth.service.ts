import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
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
  const exists = await prisma.userAuth.findFirst({ where: { identifier, deletedAt: null } });

  if (exists) {
    throw new HttpError(409, "Account already exists for this identifier");
  }

  const now = new Date();
  const merchantId = randomUUID();
  const roleId = randomUUID();
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

    await tx.role.create({
      data: {
        id: roleId,
        merchantId,
        key: "OWNER",
        name: "Owner",
        description: "Primary account owner"
      }
    });

    const user = await tx.user.create({
      data: {
        id: userId,
        merchantId,
        roleId,
        identifier,
        pinHash,
        role: "OWNER"
      }
    });

    await tx.userAuth.create({
      data: {
        id: randomUUID(),
        merchantId,
        userId,
        identifier,
        pinHash
      }
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
  const auth = await prisma.userAuth.findFirst({
    where: { identifier: args.identifier, deletedAt: null },
    include: { user: true, merchant: true }
  });

  if (!auth || auth.user.deletedAt) {
    throw new HttpError(401, "Invalid credentials");
  }

  const isValid = await bcrypt.compare(args.pin, auth.pinHash);

  if (!isValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  await prisma.device.upsert({
    where: {
      merchantId_deviceId: {
        merchantId: auth.merchantId,
        deviceId: args.deviceId
      }
    },
    create: {
      id: randomUUID(),
      merchantId: auth.merchantId,
      userId: auth.userId,
      deviceId: args.deviceId,
      lastSeenAt: new Date()
    },
    update: {
      userId: auth.userId,
      lastSeenAt: new Date(),
      revokedAt: null,
      deletedAt: null
    }
  });

  await prisma.auditLog.create({
    data: {
      merchantId: auth.merchantId,
      userId: auth.userId,
      action: "auth.login",
      entityType: "Device",
      metadata: { deviceId: args.deviceId }
    }
  });

  const token = signToken({
    userId: auth.userId,
    merchantId: auth.merchantId,
    role: auth.user.role,
    identifier: auth.identifier,
    deviceId: args.deviceId
  });

  return {
    token,
    merchant: toPlain(auth.merchant),
    user: toPlain(auth.user)
  };
}

export async function logout(prisma: PrismaClient, merchantId: string, deviceId: string): Promise<void> {
  await prisma.device.updateMany({
    where: { merchantId, deviceId },
    data: { revokedAt: new Date(), updatedAt: new Date() }
  });
}
