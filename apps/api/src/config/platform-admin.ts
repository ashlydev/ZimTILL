import bcrypt from "bcryptjs";
import { env } from "./env";

const FALLBACK_PLATFORM_ADMIN_EMAIL = "ashly.dev.js@gmail.com";
const FALLBACK_PLATFORM_ADMIN_PASSWORD_HASH = "$2a$10$b2.K5rwLyNBnBvOkup0TKef9Ijb8OQyv7NU1XwXszoaUlh33fVHlm";

export function getPlatformAdminEmail(): string {
  return env.PLATFORM_ADMIN_EMAIL?.trim() || FALLBACK_PLATFORM_ADMIN_EMAIL;
}

export async function verifyPlatformAdminCredentials(email: string, password: string): Promise<boolean> {
  if (email.trim().toLowerCase() !== getPlatformAdminEmail().toLowerCase()) {
    return false;
  }

  if (env.PLATFORM_ADMIN_PASSWORD) {
    return password === env.PLATFORM_ADMIN_PASSWORD;
  }

  return bcrypt.compare(password, FALLBACK_PLATFORM_ADMIN_PASSWORD_HASH);
}
