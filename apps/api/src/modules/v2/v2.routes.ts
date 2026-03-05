import { Router } from "express";
import { requireAuth } from "../../middleware/auth";

export const v2Router = Router();
v2Router.use(requireAuth);

function notImplemented(feature: string) {
  return {
    status: 501,
    body: {
      message: `${feature} is planned for a future release`,
      code: "NOT_IMPLEMENTED"
    }
  };
}

v2Router.all("/staff", (_req, res) => {
  const response = notImplemented("Staff accounts and permissions");
  res.status(response.status).json(response.body);
});

v2Router.all("/subscriptions", (_req, res) => {
  const response = notImplemented("Subscription billing and plan limits");
  res.status(response.status).json(response.body);
});

v2Router.all("/branches", (_req, res) => {
  const response = notImplemented("Multi-branch management");
  res.status(response.status).json(response.body);
});
