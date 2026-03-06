import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrderCreatePage } from "./pages/OrderCreatePage";
import { OrderDetailsPage } from "./pages/OrderDetailsPage";
import { ReceiptPage } from "./pages/ReceiptPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

function ProtectedRoutes() {
  const { token, loading } = useAuth();

  if (loading) {
    return <p className="screen-loading">Loading session...</p>;
  }

  if (!token) {
    return <Navigate replace to="/login" />;
  }

  return <AppLayout />;
}

function PublicOnlyRoutes({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();

  if (loading) {
    return <p className="screen-loading">Loading session...</p>;
  }

  if (token) {
    return <Navigate replace to="/" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoutes>
            <LoginPage />
          </PublicOnlyRoutes>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoutes>
            <RegisterPage />
          </PublicOnlyRoutes>
        }
      />

      <Route element={<ProtectedRoutes />}>
        <Route index element={<DashboardPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<OrderCreatePage />} />
        <Route path="/orders/:id" element={<OrderDetailsPage />} />
        <Route path="/orders/:id/receipt" element={<ReceiptPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
