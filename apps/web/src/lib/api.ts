import type {
  BackupPayload,
  Branch,
  CatalogPublicPayload,
  CatalogSettings,
  Customer,
  Delivery,
  DeviceSession,
  FeatureFlag,
  Merchant,
  Order,
  Payment,
  Plan,
  Product,
  ReceiptData,
  ReportsSummary,
  Role,
  Settings,
  StaffUser,
  StockMovement,
  StockTransfer,
  Subscription,
  UsageCounter
} from "../types";

const ENV_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function getDefaultApiBaseUrl(): string {
  if (typeof window !== "undefined" && LOCAL_DEV_HOSTS.has(window.location.hostname)) {
    return "http://localhost:3000";
  }
  return "https://novoriq-api.onrender.com";
}

function resolveApiBaseUrl(): string {
  return (ENV_API_BASE_URL || getDefaultApiBaseUrl()).replace(/\/$/, "");
}

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
  return resolveApiBaseUrl();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError(500, "API base URL is not configured");
  }

  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // Keep default message.
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
  branchId?: string;
};

export type RegisterPayload = {
  businessName: string;
  identifier: string;
  pin: string;
  deviceId: string;
};

export type AuthResponse = {
  token: string;
  merchant: Merchant;
  user: { id: string; identifier: string; role: Role; isActive?: boolean; isPlatformAdmin?: boolean };
  activeBranchId?: string | null;
};

export type MeResponse = {
  user: { id: string; identifier: string; role: Role; isActive?: boolean; isPlatformAdmin?: boolean };
  merchant: Merchant;
  settings?: Settings | null;
  branches?: Branch[];
  activeBranchId?: string | null;
  subscription?: Subscription | null;
  featureFlags?: FeatureFlag[];
};

export type SubscriptionSnapshot = {
  subscription?: Subscription | null;
  usageCounters: UsageCounter[];
  current: {
    products: number;
    users: number;
    branches: number;
    devices: number;
  };
};

export const api = {
  get health() {
    return apiRequest<{ ok: boolean; service: string; version?: string; time: string }>("/health");
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
  listBranches(token: string) {
    return apiRequest<{ branches: Branch[] }>("/branches", { token });
  },
  createBranch(token: string, payload: { name: string; address?: string; phone?: string }) {
    return apiRequest<{ branch: Branch }>("/branches", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateBranch(token: string, id: string, payload: Partial<{ name: string; address?: string; phone?: string }>) {
    return apiRequest<{ branch: Branch }>(`/branches/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
  },
  switchBranch(token: string, branchId: string) {
    return apiRequest<{ branch: Branch; token: string; activeBranchId: string }>("/branches/select", {
      method: "POST",
      token,
      body: JSON.stringify({ branchId })
    });
  },
  listProducts(token: string, search = "", lowStockOnly = false, branchId?: string | null) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (lowStockOnly) params.set("lowStock", "true");
    if (branchId) params.set("branchId", branchId);
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
  listOrders(token: string, search = "", branchId?: string | null) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (branchId) params.set("branchId", branchId);
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
  createPayment(token: string, payload: { orderId: string; amount: number; method: string; reference?: string; paidAt?: string }) {
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
  listMovements(token: string, branchId?: string | null) {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    return apiRequest<{ movements: StockMovement[] }>(`/inventory/movements${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  getLowStock(token: string, branchId?: string | null) {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    return apiRequest<{ products: Product[]; lowStockCount: number }>(`/inventory/low-stock${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  getReports(token: string, branchId?: string | null) {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    return apiRequest<ReportsSummary>(`/reports/summary${params.toString() ? `?${params.toString()}` : ""}`, { token });
  },
  listTransfers(token: string) {
    return apiRequest<{ transfers: StockTransfer[] }>("/transfers", { token });
  },
  createTransfer(
    token: string,
    payload: { fromBranchId: string; toBranchId: string; notes?: string; items: Array<{ productId: string; quantity: number }> }
  ) {
    return apiRequest<{ transfer: StockTransfer }>("/transfers", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  approveTransfer(token: string, id: string) {
    return apiRequest<{ transfer: StockTransfer }>(`/transfers/${id}/approve`, { method: "POST", token });
  },
  receiveTransfer(token: string, id: string) {
    return apiRequest<{ transfer: StockTransfer }>(`/transfers/${id}/receive`, { method: "POST", token });
  },
  listDeliveries(token: string) {
    return apiRequest<{ deliveries: Delivery[] }>("/deliveries", { token });
  },
  assignDelivery(token: string, payload: { orderId: string; assignedToUserId?: string | null }) {
    return apiRequest<{ delivery: Delivery }>("/deliveries/assign", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateDeliveryStatus(token: string, id: string, payload: { status: Delivery["status"]; proofPhotoUrl?: string }) {
    return apiRequest<{ delivery: Delivery }>(`/deliveries/${id}/status`, {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
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
  },
  listPlans() {
    return apiRequest<{ plans: Plan[] }>("/subscriptions/plans");
  },
  getSubscriptionSnapshot(token: string) {
    return apiRequest<SubscriptionSnapshot>("/subscriptions/current", { token });
  },
  requestUpgrade(token: string, payload: { requestedPlanCode: "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE"; notes?: string }) {
    return apiRequest<{ request: Record<string, unknown> }>("/subscriptions/request-upgrade", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  getCatalogSettings(token: string) {
    return apiRequest<{ settings: CatalogSettings | null }>("/catalog/settings/me", { token });
  },
  updateCatalogSettings(token: string, payload: Partial<CatalogSettings>) {
    return apiRequest<{ settings: CatalogSettings }>("/catalog/settings/me", {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
  },
  getPublicCatalog(merchantSlug: string) {
    return apiRequest<CatalogPublicPayload>(`/catalog/${merchantSlug}`);
  },
  checkoutPublicCatalog(
    merchantSlug: string,
    payload: {
      customerName: string;
      customerPhone: string;
      notes?: string;
      items: Array<{ productId: string; quantity: number }>;
      paymentMode?: "ECOCASH" | "PAY_LATER";
    }
  ) {
    return apiRequest<{ customer: Customer; order: Order; paynow: Record<string, unknown> | null }>(`/catalog/${merchantSlug}/checkout`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getAdminOverview(token: string) {
    return apiRequest<{
      totals: { merchants: number; openUpgradeRequests: number };
      subscriptions: Subscription[];
    }>("/admin/overview", { token });
  },
  listAdminMerchants(token: string) {
    return apiRequest<{ merchants: Array<Merchant & { subscriptions?: Subscription[]; usageCounters?: UsageCounter[] }> }>("/admin/merchants", { token });
  },
  listAdminFeatureFlags(token: string) {
    return apiRequest<{ flags: FeatureFlag[] }>("/admin/feature-flags", { token });
  },
  adminDisableUser(token: string, userId: string, isActive: boolean) {
    return apiRequest<{ user: StaffUser }>("/admin/support/disable-user", {
      method: "POST",
      token,
      body: JSON.stringify({ userId, isActive })
    });
  },
  adminResetPin(token: string, userId: string, pin: string) {
    return apiRequest<{ success: boolean }>("/admin/support/reset-pin", {
      method: "POST",
      token,
      body: JSON.stringify({ userId, pin })
    });
  },
  adminImpersonate(token: string, payload: { merchantId: string; userId?: string }) {
    return apiRequest<{ token: string; user: StaffUser }>("/admin/support/impersonate", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  }
};
