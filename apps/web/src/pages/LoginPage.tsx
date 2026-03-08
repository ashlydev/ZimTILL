import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InstallAppButton } from "../components/InstallAppButton";
import { Button, getButtonClassName } from "../components/ui/Button";
import { Input } from "../components/ui/FormControls";
import { getUserError, useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const downloadUrl = typeof window === "undefined" ? "https://novoriq-orders-pwa.netlify.app" : window.location.origin;

  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(identifier.trim(), pin);
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(getUserError(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card form-stack" onSubmit={onSubmit}>
        <div>
          <p className="sidebar-kicker auth-brand">ZimTILL</p>
          <h1>Welcome Back</h1>
          <p className="subtle-text">Sign in with your phone or email and PIN.</p>
        </div>

        <Input
          label="Phone or Email"
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="+2637... or name@email.com"
          required
          value={identifier}
        />

        <Input
          label="PIN"
          maxLength={6}
          minLength={4}
          onChange={(event) => setPin(event.target.value)}
          pattern="[0-9]{4,6}"
          placeholder="4-6 digits"
          required
          type="password"
          value={pin}
        />

        {error ? <p className="status-text error">{error}</p> : null}

        <Button disabled={busy} type="submit" variant="primary">
          {busy ? "Signing in..." : "Sign In"}
        </Button>

        <div className="install-note form-stack">
          <InstallAppButton />
          <a className={getButtonClassName("secondary")} href={downloadUrl}>
            Download ZimTILL
          </a>
        </div>

        <div className="auth-links">
          <Link to="/register">Create account</Link>
          <span className="subtle-text">Forgot PIN support is available in V1 support channels.</span>
        </div>
      </form>
    </div>
  );
}
