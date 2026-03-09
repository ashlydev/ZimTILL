import bcrypt from "bcryptjs";
import { PrismaClient, RoleType } from "@prisma/client";
import { registerSchema } from "@novoriq/shared";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../lib/http";
import { signToken } from "../../lib/token";
import { toPlain } from "../../lib/serialization";
import { assertPlanLimit, ensureMerchantBootstrap, incrementUsageCounter, slugify } from "../platform/platform.service";

const defaultWhatsappTemplate =
  "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.";

type UserAuthClient = Pick<PrismaClient, "userAuth">;
type RoleClient = Pick<PrismaClient, "role">;

const allRoles: RoleType[] = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "STOCK_CONTROLLER", "DELIVERY_RIDER"];

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

async function ensureRole(tx: RoleClient, merchantId: string, role: RoleType) {
  const key = role;
  const name = role
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

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
  activeBranchId: string;
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
  const merchantSlug = `${slugify(businessName)}-${merchantId.slice(0, 6)}`;

  const result = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({
      data: {
        id: merchantId,
        name: businessName,
        slug: merchantSlug,
        phone: identifier.includes("@") ? null : identifier,
        email: identifier.includes("@") ? identifier : null
      }
    });

    const roleByKey = new Map<RoleType, { id: string }>();
    for (const role of allRoles) {
      const savedRole = await ensureRole(tx as unknown as RoleClient, merchantId, role);
      roleByKey.set(role, savedRole);
    }

    const bootstrap = await ensureMerchantBootstrap(tx, {
      merchantId,
      merchantName: businessName,
      merchantSlug,
      ownerUserId: userId,
      deviceId,
      contactPhone: identifier.includes("@") ? null : identifier
    });

    const user = await tx.user.create({
      data: {
        id: userId,
        merchantId,
        roleId: roleByKey.get("OWNER")?.id,
        defaultBranchId: bootstrap.defaultBranchId,
        identifier,
        pinHash,
        role: "OWNER",
        isActive: true,
        isPlatformAdmin: false
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
        activeBranchId: bootstrap.defaultBranchId,
        lastSeenAt: now
      }
    });

    await tx.settings.create({
      data: {
        id: randomUUID(),
        merchantId,
        createdByUserId: userId,
        updatedByUserId: userId,
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

    await tx.auditLog.create({
      data: {
        merchantId,
        branchId: bootstrap.defaultBranchId,
        userId,
        action: "auth.register",
        entityType: "User",
        entityId: userId,
        metadata: { identifier }
      }
    });

    return { merchant, user, activeBranchId: bootstrap.defaultBranchId };
  });

  const token = signToken({
    userId,
    merchantId,
    role: "OWNER",
    identifier,
    deviceId,
    branchId: result.activeBranchId,
    platformAccess: false
  });

  return {
    token,
    merchant: toPlain(result.merchant),
    user: toPlain(result.user),
    activeBranchId: result.activeBranchId
  };
}

export async function login(
  prisma: PrismaClient,
  args: {
    identifier: string;
    pin: string;
    deviceId: string;
    branchId?: string;
  }
): Promise<{
  token: string;
  merchant: Record<string, unknown>;
  user: Record<string, unknown>;
  activeBranchId: string | null;
}> {
  const user = await prisma.user.findFirst({
    where: {
      identifier: args.identifier,
      deletedAt: null,
      isActive: true
    },
    include: {
      merchant: true,
      defaultBranch: true
    }
  });

  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  if (!user.merchant?.isActive) {
    throw new HttpError(403, "Merchant account is deactivated. Contact support on WhatsApp for help.", "MERCHANT_DISABLED");
  }

  const isValid = await bcrypt.compare(args.pin, user.pinHash);
  if (!isValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  await assertPlanLimit(prisma, user.merchantId, "devices", 0);

  const chosenBranch =
    (args.branchId
      ? await prisma.branch.findFirst({
          where: {
            id: args.branchId,
            merchantId: user.merchantId,
            deletedAt: null
          }
        })
      : null) ??
    user.defaultBranch ??
    (await prisma.branch.findFirst({
      where: { merchantId: user.merchantId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    }));

  const device = await prisma.device.upsert({
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
      activeBranchId: chosenBranch?.id ?? null,
      lastSeenAt: new Date()
    },
    update: {
      userId: user.id,
      activeBranchId: chosenBranch?.id ?? null,
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
      branchId: chosenBranch?.id ?? null,
      userId: user.id,
      action: "auth.login",
      entityType: "Device",
      metadata: { deviceId: args.deviceId }
    }
  });

  await incrementUsageCounter(prisma, user.merchantId, "devices", 0);

  const token = signToken({
    userId: user.id,
    merchantId: user.merchantId,
    role: user.role,
    identifier: user.identifier,
    deviceId: args.deviceId,
    branchId: device.activeBranchId ?? null,
    platformAccess: false
  });

  return {
    token,
    merchant: toPlain(user.merchant),
    user: toPlain(user),
    activeBranchId: device.activeBranchId ?? null
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
