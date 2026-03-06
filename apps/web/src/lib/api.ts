import type {
  BackupPayload,
  Customer,
  DeviceSession,
  Order,
  Payment,
  Product,
  ReceiptData,
  ReportsSummary,
  Role,
  Settings,
  StaffUser,
  StockMovement
} from "../types";

const ENV_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function getDefaultApiBaseUrl(): string {
  if (typeof window !== "undefined" && LOCAL_DEV_HOSTS.has(window.location.hostname)) {
    return "http://localhost:3000";
  }
  return "https://novoriq-api.onrender.com";
}

const API_BASE_URL = (ENV_API_BASE_URL || getDefaultApiBaseUrl()).replace(/\/$/, "");

type RequestOptions = RequestInit & {
  token?: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError(500, "Missing API base URL configuration");
  }

  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type LoginPayload = {
  identifier: string;
  pin: string;
  deviceId: string;
};

export type RegisterPayload = {
  businessName: string;
  identifier: string;
  pin: string;
  deviceId: string;
};

export type AuthResponse = {
  token: string;
  merchant: { id: string; name: string };
  user: { id: string; identifier: string; role: Role; isActive?: boolean };
};

export type MeResponse = {
  user: { id: string; identifier: string; role: Role; isActive?: boolean };
  merchant: { id: string; name: string };
  settings?: Settings | null;
};

export const api = {
  get health() {
    return apiRequest<{ ok: boolean; service: string; time: string }>("/health");
  },
  login(payload: LoginPayload) {
    return apiRequest<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(payload) });
  },
  register(payload: RegisterPayload) {
    return apiRequest<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(payload) });
  },
  me(token: string) {
    return apiRequest<MeResponse>("/auth/me", { token });
  },
  logout(token: string, deviceId: string) {
    return apiRequest<{ success: boolean }>("/auth/logout", {
      method: "POST",
      token,
      body: JSON.stringify({ deviceId })
    });
  },
  listProducts(token: string, search = "", lowStockOnly = false) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (lowStockOnly) params.set("lowStock", "true");
    return apiRequest<{ products: Product[] }>(`/products${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  createProduct(token: string, payload: Partial<Product>) {
    return apiRequest<{ product: Product }>("/products", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateProduct(token: string, id: string, payload: Partial<Product>) {
    return apiRequest<{ product: Product }>(`/products/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
  },
  deleteProduct(token: string, id: string) {
    return apiRequest<{ product: Product }>(`/products/${id}`, { method: "DELETE", token });
  },
  adjustStock(token: string, id: string, quantity: number, reason?: string) {
    return apiRequest<{ product: Product }>(`/products/${id}/adjust-stock`, {
      method: "POST",
      token,
      body: JSON.stringify({ quantity, reason })
    });
  },
  listCustomers(token: string, search = "") {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    return apiRequest<{ customers: Customer[] }>(`/customers${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  createCustomer(token: string, payload: Partial<Customer>) {
    return apiRequest<{ customer: Customer }>("/customers", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateCustomer(token: string, id: string, payload: Partial<Customer>) {
    return apiRequest<{ customer: Customer }>(`/customers/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
  },
  deleteCustomer(token: string, id: string) {
    return apiRequest<{ customer: Customer }>(`/customers/${id}`, { method: "DELETE", token });
  },
  listOrders(token: string, search = "") {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    return apiRequest<{ orders: Order[] }>(`/orders${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  createOrder(
    token: string,
    payload: {
      customerId?: string | null;
      items: Array<{ productId: string; quantity: number }>;
      discountAmount?: number;
      discountPercent?: number;
      notes?: string;
    }
  ) {
    return apiRequest<{ order: Order }>("/orders", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  getOrder(token: string, id: string) {
    return apiRequest<{
      order: Order & { items: Array<{ id: string; quantity: number; unitPrice: number; lineTotal: number; product: Product }>; payments: Payment[] };
      summary: { paid: number; balance: number };
    }>(`/orders/${id}`, { token });
  },
  getReceipt(token: string, id: string) {
    return apiRequest<{ receipt: ReceiptData }>(`/orders/${id}/receipt`, { token });
  },
  confirmOrder(token: string, id: string) {
    return apiRequest<{ order: Order }>(`/orders/${id}/confirm`, { method: "POST", token });
  },
  cancelOrder(token: string, id: string) {
    return apiRequest<{ order: Order }>(`/orders/${id}/cancel`, { method: "POST", token });
  },
  getOrderShareText(token: string, id: string) {
    return apiRequest<{ message: string }>(`/orders/${id}/share-text`, { token });
  },
  listPayments(token: string) {
    return apiRequest<{ payments: Payment[] }>("/payments", { token });
  },
  createPayment(
    token: string,
    payload: { orderId: string; amount: number; method: string; reference?: string; paidAt?: string }
  ) {
    return apiRequest<{ payment: Payment }>("/payments", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  initiatePaynow(
    token: string,
    payload: { orderId: string; amount: number; method: "ecocash" | "onemoney" | "web" | "card" | "other"; phone?: string }
  ) {
    return apiRequest<{ transactionId: string; pollUrl: string; redirectUrl?: string; instructions: string }>("/payments/paynow/initiate", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  checkPaynowStatus(token: string, transactionId: string) {
    return apiRequest<{ status: string; message: string }>("/payments/paynow/status", {
      method: "POST",
      token,
      body: JSON.stringify({ transactionId })
    });
  },
  listMovements(token: string) {
    return apiRequest<{ movements: StockMovement[] }>("/inventory/movements", { token });
  },
  getLowStock(token: string) {
    return apiRequest<{ products: Product[]; lowStockCount: number }>("/inventory/low-stock", { token });
  },
  getReports(token: string) {
    return apiRequest<ReportsSummary>("/reports/summary", { token });
  },
  getSettings(token: string) {
    return apiRequest<{ settings: Settings }>("/settings", { token });
  },
  updateSettings(token: string, payload: Partial<Settings>) {
    return apiRequest<{ settings: Settings }>("/settings", {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
  },
  listStaff(token: string) {
    return apiRequest<{ staff: StaffUser[] }>("/settings/staff", { token });
  },
  createStaff(token: string, payload: { identifier: string; pin: string; role: Role }) {
    return apiRequest<{ user: StaffUser }>("/settings/staff", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateStaffRole(token: string, userId: string, role: Role) {
    return apiRequest<{ user: StaffUser }>(`/settings/staff/${userId}/role`, {
      method: "PUT",
      token,
      body: JSON.stringify({ role })
    });
  },
  resetStaffPin(token: string, userId: string, pin: string) {
    return apiRequest<{ success: boolean }>(`/settings/staff/${userId}/reset-pin`, {
      method: "POST",
      token,
      body: JSON.stringify({ pin })
    });
  },
  deactivateStaff(token: string, userId: string) {
    return apiRequest<{ success: boolean }>(`/settings/staff/${userId}/deactivate`, {
      method: "POST",
      token
    });
  },
  reactivateStaff(token: string, userId: string) {
    return apiRequest<{ user: StaffUser }>(`/settings/staff/${userId}/reactivate`, {
      method: "POST",
      token
    });
  },
  listDevices(token: string) {
    return apiRequest<{ devices: DeviceSession[] }>("/settings/devices", { token });
  },
  revokeDevice(token: string, id: string) {
    return apiRequest<{ device: DeviceSession }>(`/settings/devices/${id}/revoke`, {
      method: "POST",
      token
    });
  },
  exportBackup(token: string) {
    return apiRequest<BackupPayload>("/settings/backup/export", { token });
  },
  importBackup(token: string, backup: BackupPayload | Record<string, unknown>) {
    return apiRequest<{ success: boolean; imported: Record<string, number> }>("/settings/backup/import", {
      method: "POST",
      token,
      body: JSON.stringify({ backup })
    });
  }
};
