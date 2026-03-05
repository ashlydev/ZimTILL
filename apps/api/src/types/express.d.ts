import type { AuthTokenPayload } from "../lib/token";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};
