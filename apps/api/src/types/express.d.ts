import type { MerchantAuthTokenPayload } from "../lib/token";

declare global {
  namespace Express {
    interface Request {
      user?: MerchantAuthTokenPayload;
      platformAdmin?: {
        email: string;
      };
    }
  }
}

export {};
