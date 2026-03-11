import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { validateBody } from "../../middleware/validate";
import { toPlain } from "../../lib/serialization";
import { recordAudit } from "../audit/audit.service";

const paymentMethodSchema = z.enum(["CASH", "ECOCASH", "ZIPIT", "BANK_TRANSFER", "OTHER", "PAYNOW"]);

const expenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  amount: z.coerce.number().positive().max(999999999),
  paymentMethod: paymentMethodSchema.default("CASH"),
  payee: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  spentAt: z.string().datetime().optional(),
  branchId: z.string().uuid().nullable().optional()
});

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  branchId: z.string().uuid().optional(),
  category: z.string().trim().optional()
});

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getTodayWindow() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from, to };
}

async function assertBranchAccess(merchantId: string, branchId: string | null | undefined) {
  if (!branchId) {
    return null;
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      merchantId,
      deletedAt: null
    }
  });

  if (!branch) {
    throw new HttpError(404, "Branch not found");
  }

  return branch.id;
}

expensesRouter.get(
  "/",
  requirePermission("expenses.read"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const fallbackWindow = getTodayWindow();
    const from = query.from ? new Date(query.from) : fallbackWindow.from;
    const to = query.to ? new Date(query.to) : fallbackWindow.to;
    const branchId = query.branchId ?? req.user!.branchId ?? undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        merchantId: req.user!.merchantId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(query.category ? { category: query.category } : {}),
        spentAt: { gte: from, lte: to }
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, identifier: true, role: true } }
      },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }]
    });

    const summaryMap = new Map<string, number>();
    let total = 0;
    for (const expense of expenses) {
      const amount = Number(expense.amount ?? 0);
      total += amount;
      summaryMap.set(expense.category, (summaryMap.get(expense.category) ?? 0) + amount);
    }

    res.json({
      expenses: toPlain(expenses),
      summary: {
        total,
        count: expenses.length,
        byCategory: [...summaryMap.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((left, right) => right.amount - left.amount)
      }
    });
  })
);

expensesRouter.post(
  "/",
  requirePermission("expenses.write"),
  validateBody(expenseSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof expenseSchema>;
    const branchId = await assertBranchAccess(req.user!.merchantId, body.branchId ?? req.user!.branchId ?? null);
    const spentAt = body.spentAt ? new Date(body.spentAt) : new Date();
    const expense = await prisma.expense.create({
      data: {
        merchantId: req.user!.merchantId,
        branchId,
        createdByUserId: req.user!.userId,
        updatedByUserId: req.user!.userId,
        title: body.title,
        category: body.category,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        payee: body.payee ?? null,
        notes: body.notes ?? null,
        spentAt,
        lastModifiedByDeviceId: req.user!.deviceId
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, identifier: true, role: true } }
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      metadata: {
        title: expense.title,
        category: expense.category,
        amount: Number(expense.amount)
      }
    });

    res.status(201).json({ expense: toPlain(expense) });
  })
);

expensesRouter.put(
  "/:id",
  requirePermission("expenses.write"),
  validateBody(expenseSchema.partial().refine((value) => Object.keys(value).length > 0, "No changes supplied")),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const existing = await prisma.expense.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new HttpError(404, "Expense not found");
    }

    const body = req.body as z.infer<typeof expenseSchema>;
    const branchId =
      body.branchId !== undefined
        ? await assertBranchAccess(req.user!.merchantId, body.branchId)
        : existing.branchId;

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        title: body.title ?? existing.title,
        category: body.category ?? existing.category,
        amount: body.amount ?? existing.amount,
        paymentMethod: body.paymentMethod ?? existing.paymentMethod,
        payee: body.payee !== undefined ? body.payee ?? null : existing.payee,
        notes: body.notes !== undefined ? body.notes ?? null : existing.notes,
        spentAt: body.spentAt ? new Date(body.spentAt) : existing.spentAt,
        branchId,
        updatedByUserId: req.user!.userId,
        updatedAt: new Date(),
        lastModifiedByDeviceId: req.user!.deviceId
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, identifier: true, role: true } }
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "expense.update",
      entityType: "Expense",
      entityId: updated.id
    });

    res.json({ expense: toPlain(updated) });
  })
);

expensesRouter.delete(
  "/:id",
  requirePermission("expenses.write"),
  asyncHandler(async (req, res) => {
    const id = getRouteParam(req.params.id);
    const existing = await prisma.expense.findFirst({
      where: {
        id,
        merchantId: req.user!.merchantId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new HttpError(404, "Expense not found");
    }

    const deleted = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedByUserId: req.user!.userId,
        lastModifiedByDeviceId: req.user!.deviceId
      }
    });

    await recordAudit(prisma, req.user!, {
      action: "expense.delete",
      entityType: "Expense",
      entityId: deleted.id
    });

    res.json({ expense: toPlain(deleted) });
  })
);
