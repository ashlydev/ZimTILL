import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";

export function BranchesPage() {
  const { token, branches, activeBranchId, switchBranch, refreshMe } = useAuth();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      await api.createBranch(token, { name, address, phone });
      setName("");
      setAddress("");
      setPhone("");
      await refreshMe();
      setMessage("Branch created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create branch");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        title="Branches"
        subtitle="Manage locations and switch the active branch used for orders, stock, and reports."
      />

      {message ? <p className="status-text">{message}</p> : null}

      <div className="split-grid">
        <Card title="Current Branches" subtitle="Tenant-scoped branch management">
          {branches.length === 0 ? (
            <EmptyState title="No branches" description="Create a branch to start separating stock and reports." />
          ) : (
            <div className="card-stack">
              {branches.map((branch) => (
                <ListCard
                  key={branch.id}
                  title={branch.name}
                  subtitle={branch.address || "No address"}
                  badge={branch.id === activeBranchId ? <span className="status-badge status-paid">Active</span> : null}
                  fields={[
                    { label: "Phone", value: branch.phone || "Not set" },
                    { label: "Stock lines", value: branch.stockLines ?? 0 }
                  ]}
                  actions={
                    branch.id === activeBranchId ? null : (
                      <Button size="sm" variant="secondary" onClick={() => void switchBranch(branch.id)}>
                        Switch
                      </Button>
                    )
                  }
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Add Branch" subtitle="Expand into another warehouse, branch, or store">
          <form className="form-stack" onSubmit={onSubmit}>
            <Input label="Branch name" required value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
            <Input label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Saving..." : "Create Branch"}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}
