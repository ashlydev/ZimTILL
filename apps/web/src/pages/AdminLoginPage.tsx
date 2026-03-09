import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearPlatformAdminToken, getPlatformAdminToken, setPlatformAdminToken } from "../lib/storage";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/FormControls";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Login failed";
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getPlatformAdminToken()) {
      navigate("/admin", { replace: true });
    }
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await api.platformAdminLogin({
        email: email.trim(),
        password
      });
      setPlatformAdminToken(result.token);
      navigate("/admin", { replace: true });
    } catch (loginError) {
      clearPlatformAdminToken();
      setError(getErrorMessage(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card form-stack" onSubmit={onSubmit}>
        <div>
          <p className="sidebar-kicker auth-brand">Novoriq Stock Plattform</p>
          <h1>Platform Admin</h1>
          <p className="subtle-text">Sign in with the dedicated platform admin credentials.</p>
        </div>

        <Input label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        <Input label="Password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />

        {error ? <p className="status-text error">{error}</p> : null}

        <Button disabled={busy} type="submit" variant="primary">
          {busy ? "Signing in..." : "Sign In"}
        </Button>

        <Card subtitle="Merchant owners and merchant admins create their own staff from Settings inside the main app." title="Merchant Staff Management">
          <Link className="text-link" to="/login">
            Open merchant login
          </Link>
        </Card>
      </form>
    </div>
  );
}
