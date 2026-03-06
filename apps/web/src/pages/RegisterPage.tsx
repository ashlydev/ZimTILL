import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/FormControls";
import { getUserError, useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (pin !== confirmPin) {
      setError("PIN confirmation does not match");
      return;
    }

    setBusy(true);
    try {
      await register(businessName.trim(), identifier.trim(), pin);
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
          <h1>Create Merchant Account</h1>
          <p className="subtle-text">Start managing products, orders, and payments immediately.</p>
        </div>

        <Input label="Business Name" onChange={(event) => setBusinessName(event.target.value)} placeholder="Ashly Hardware" required value={businessName} />

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

        <Input
          label="Confirm PIN"
          maxLength={6}
          minLength={4}
          onChange={(event) => setConfirmPin(event.target.value)}
          pattern="[0-9]{4,6}"
          placeholder="Repeat PIN"
          required
          type="password"
          value={confirmPin}
        />

        {error ? <p className="status-text error">{error}</p> : null}

        <Button disabled={busy} type="submit" variant="primary">
          {busy ? "Creating account..." : "Create Account"}
        </Button>

        <div className="auth-links">
          <Link to="/login">Already have an account?</Link>
        </div>
      </form>
    </div>
  );
}
