import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function seed() {
  const merchantId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const now = new Date();
  const pinHash = await bcrypt.hash("1234", 10);

  await prisma.merchant.create({
    data: {
      id: merchantId,
      name: "Demo Merchant",
      phone: "+263771234567",
      email: "owner@demo.co.zw"
    }
  });

  await prisma.role.create({
    data: {
      id: roleId,
      merchantId,
      key: "OWNER",
      name: "Owner"
    }
  });

  await prisma.user.create({
    data: {
      id: userId,
      merchantId,
      identifier: "+263771234567",
      pinHash,
      role: "OWNER",
      roleId
    }
  });

  await prisma.userAuth.create({
    data: {
      id: randomUUID(),
      merchantId,
      userId,
      identifier: "+263771234567",
      pinHash
    }
  });

  await prisma.settings.create({
    data: {
      id: randomUUID(),
      merchantId,
      businessName: "Demo Merchant",
      currencyCode: "USD",
      currencySymbol: "$",
      paymentInstructions: "Pay via EcoCash, ZIPIT or cash.",
      whatsappTemplate:
        "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPay via {paymentInstructions}\nThank you.",
      supportPhone: "+263770000000",
      supportEmail: "support@novoriq.com",
      createdAt: now,
      updatedAt: now,
      version: 1,
      lastModifiedByDeviceId: "seed"
    }
  });

  await prisma.product.createMany({
    data: [
      {
        id: randomUUID(),
        merchantId,
        name: "Bread",
        price: 1,
        cost: 0.6,
        sku: "BRD-001",
        stockQty: 100,
        lowStockThreshold: 10,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: "seed"
      },
      {
        id: randomUUID(),
        merchantId,
        name: "Milk 1L",
        price: 1.5,
        cost: 1,
        sku: "MLK-001",
        stockQty: 80,
        lowStockThreshold: 15,
        createdAt: now,
        updatedAt: now,
        version: 1,
        lastModifiedByDeviceId: "seed"
      }
    ]
  });

  await prisma.featureFlag.createMany({
    data: [
      { key: "v2.staffAccounts", enabled: false, merchantId },
      { key: "v2.multiBranch", enabled: false, merchantId }
    ]
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete:", { merchantId, userPin: "1234", identifier: "+263771234567" });
}

seed()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
