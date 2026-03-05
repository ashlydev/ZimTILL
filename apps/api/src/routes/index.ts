import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { productsRouter } from "../modules/products/products.routes";
import { customersRouter } from "../modules/customers/customers.routes";
import { ordersRouter } from "../modules/orders/orders.routes";
import { paymentsRouter } from "../modules/payments/payments.routes";
import { inventoryRouter } from "../modules/inventory/inventory.routes";
import { settingsRouter } from "../modules/settings/settings.routes";
import { syncRouter } from "../modules/sync/sync.routes";
import { reportsRouter } from "../modules/reports/reports.routes";
import { merchantsRouter } from "../modules/merchants/merchants.routes";
import { flagsRouter } from "../modules/flags/flags.routes";
import { v2Router } from "../modules/v2/v2.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/merchants", merchantsRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/inventory", inventoryRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/sync", syncRouter);
apiRouter.use("/flags", flagsRouter);
apiRouter.use("/v2", v2Router);
