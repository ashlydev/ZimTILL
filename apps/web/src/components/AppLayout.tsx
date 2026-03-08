import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { classNames } from "../lib/format";
import { OfflineBadge } from "./OfflineBadge";
import { getButtonClassName } from "./ui/Button";

type NavItem = {
  to: string;
  label: string;
  roles?: Array<"OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "STOCK_CONTROLLER" | "DELIVERY_RIDER">;
  requireFeature?: string;
};

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/products", label: "Products" },
  { to: "/customers", label: "Customers", roles: ["OWNER", "ADMIN", "MANAGER", "CASHIER"] },
  { to: "/payments", label: "Payments", roles: ["OWNER", "ADMIN", "MANAGER", "CASHIER"] },
  { to: "/inventory", label: "Inventory", roles: ["OWNER", "ADMIN", "MANAGER", "STOCK_CONTROLLER"] },
  { to: "/transfers", label: "Transfers", roles: ["OWNER", "ADMIN", "MANAGER", "STOCK_CONTROLLER"] },
  { to: "/deliveries", label: "Deliveries", roles: ["OWNER", "ADMIN", "MANAGER", "DELIVERY_RIDER"], requireFeature: "DELIVERY_MODE" },
  { to: "/reports", label: "Reports", roles: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "STOCK_CONTROLLER"] },
  { to: "/branches", label: "Branches", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/catalog", label: "Catalog", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/pricing", label: "Pricing", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/settings", label: "Settings", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/admin", label: "Platform Admin", roles: ["OWNER", "ADMIN"], requireFeature: "PLATFORM_ADMIN" }
];

const mobileTabs: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/products", label: "Products" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings", roles: ["OWNER", "ADMIN", "MANAGER"] }
];

function getRouteTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/orders/new")) return "Create Order";
  if (pathname.startsWith("/orders/") && pathname.endsWith("/receipt")) return "Receipt";
  if (pathname.startsWith("/orders/")) return "Order Details";
  if (pathname.startsWith("/orders")) return "Orders";
  if (pathname.startsWith("/products")) return "Products";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/inventory")) return "Inventory";
  if (pathname.startsWith("/transfers")) return "Transfers";
  if (pathname.startsWith("/deliveries")) return "Deliveries";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/branches")) return "Branches";
  if (pathname.startsWith("/catalog")) return "Catalog";
  if (pathname.startsWith("/pricing")) return "Pricing";
  if (pathname.startsWith("/admin")) return "Platform Admin";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Novoriq Orders";
}

export function AppLayout() {
  const { merchant, user, branches, activeBranchId, switchBranch, hasFeature, logout } = useAuth();
  const location = useLocation();

  const visibleSidebarItems = navItems.filter((item) => {
    if (item.roles && (!user || !item.roles.includes(user.role))) {
      return false;
    }
    if (item.requireFeature && !hasFeature(item.requireFeature)) {
      return false;
    }
    return true;
  });

  const visibleMobileTabs = mobileTabs.filter((item) => {
    if (item.roles && (!user || !item.roles.includes(user.role))) {
      return false;
    }
    if (item.requireFeature && !hasFeature(item.requireFeature)) {
      return false;
    }
    return true;
  });

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <p className="sidebar-kicker">Novoriq Orders V3</p>
          <h1>{merchant?.name ?? "Merchant"}</h1>
        </div>

        <nav className="sidebar-nav">
          {visibleSidebarItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => classNames("sidebar-link", isActive && "is-active")}
              end={item.to === "/"}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div>
            <p className="topbar-kicker">{merchant?.name ?? "Merchant"}</p>
            <h2>{getRouteTitle(location.pathname)}</h2>
          </div>
          <div className="topbar-actions topbar-actions-wide">
            {branches.length > 0 ? (
              <label className="branch-switcher">
                <span>Branch</span>
                <select
                  className="input-control input-control-compact"
                  onChange={(event) => void switchBranch(event.target.value)}
                  value={activeBranchId ?? ""}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <OfflineBadge />
            <button className={getButtonClassName("ghost", "sm")} onClick={() => void logout()} type="button">
              Logout
            </button>
          </div>
        </header>

        <main className="app-content">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>

      <nav aria-label="Bottom tabs" className="mobile-tabbar">
        {visibleMobileTabs.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) => classNames("mobile-tab", isActive && "is-active")}
            end={item.to === "/"}
            to={item.to}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
