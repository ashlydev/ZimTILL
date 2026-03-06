import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { classNames } from "../lib/format";
import { OfflineBadge } from "./OfflineBadge";
import { getButtonClassName } from "./ui/Button";

const sidebarItems = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/products", label: "Products" },
  { to: "/customers", label: "Customers" },
  { to: "/payments", label: "Payments" },
  { to: "/inventory", label: "Inventory" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" }
];

const mobileTabs = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/products", label: "Products" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" }
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
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Novoriq Orders";
}

export function AppLayout() {
  const { merchant, user, logout } = useAuth();
  const location = useLocation();
  const isCashier = user?.role === "CASHIER";

  const visibleSidebarItems = sidebarItems.filter((item) => {
    if (!isCashier) return true;
    return ["/", "/orders", "/products", "/customers", "/payments", "/reports"].includes(item.to);
  });

  const visibleMobileTabs = mobileTabs.filter((item) => {
    if (!isCashier) return true;
    return item.to !== "/settings";
  });

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <p className="sidebar-kicker">Novoriq Orders</p>
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
          <div className="topbar-actions">
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
