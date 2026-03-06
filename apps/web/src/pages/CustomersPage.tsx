import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { loadWithCache } from "../lib/cache";
import type { Customer } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

const emptyForm = { name: "", phone: "", notes: "" };

const customerColumns: Array<TableColumn<Customer>> = [
  {
    key: "name",
    header: "Name",
    render: (customer) => customer.name
  },
  {
    key: "phone",
    header: "Phone",
    render: (customer) => customer.phone || "-"
  },
  {
    key: "notes",
    header: "Notes",
    render: (customer) => customer.notes || "-"
  }
];

export function CustomersPage() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");
    try {
      const result = await loadWithCache(`customers:${search}`, () => api.listCustomers(token, search));
      setCustomers(result.value.customers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load customers");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, search]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setBusy(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null
    };

    try {
      if (editingId) {
        await api.updateCustomer(token, editingId, payload);
      } else {
        await api.createCustomer(token, payload);
      }
      resetForm();
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save customer");
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setShowForm(true);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      notes: customer.notes ?? ""
    });
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Delete this customer?")) return;
    setError("");
    try {
      await api.deleteCustomer(token, id);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete customer");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Button
            onClick={() => {
              if (showForm && !editingId) {
                setShowForm(false);
                return;
              }
              setShowForm(true);
              setEditingId(null);
              setForm(emptyForm);
            }}
            variant="primary"
          >
            {showForm && !editingId ? "Close Form" : "Add Customer"}
          </Button>
        }
        subtitle="Maintain customer contacts for faster repeat orders and support."
        title="Customers"
      />

      <Card>
        <div className="filters-row">
          <div className="filters-left">
            <Input label="Search" onChange={(event) => setSearch(event.target.value)} placeholder="Search by customer name or phone" value={search} />
          </div>
          <div className="filters-right">
            <Button onClick={() => void refresh()} variant="secondary">
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {showForm ? (
        <Card
          action={
            <Button onClick={resetForm} variant="ghost">
              Cancel
            </Button>
          }
          title={editingId ? "Edit Customer" : "Add Customer"}
        >
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="form-grid">
              <Input label="Name" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
              <Input label="Phone" onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} value={form.phone} />
              <TextArea
                containerClassName="span-2"
                label="Notes"
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                value={form.notes}
              />
            </div>

            <div className="actions-row">
              <Button disabled={busy} type="submit" variant="primary">
                {busy ? "Saving..." : editingId ? "Update Customer" : "Create Customer"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Customer details and contact history" title="Customer List">
        {customers.length === 0 ? (
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                variant="primary"
              >
                Add Customer
              </Button>
            }
            description="Create a customer profile so orders can be tracked by buyer."
            title="No customers found"
          />
        ) : (
          <>
            <div className="desktop-only">
              <Table
                columns={[
                  ...customerColumns,
                  {
                    key: "actions",
                    header: "Actions",
                    render: (customer) => (
                      <div className="table-actions">
                        <Button onClick={() => onEdit(customer)} size="sm" variant="secondary">
                          Edit
                        </Button>
                        <Button onClick={() => void onDelete(customer.id)} size="sm" variant="danger">
                          Delete
                        </Button>
                      </div>
                    )
                  }
                ]}
                rowKey={(customer) => customer.id}
                rows={customers}
              />
            </div>

            <div className="mobile-only card-stack">
              {customers.map((customer) => (
                <ListCard
                  key={customer.id}
                  actions={
                    <div className="list-inline-actions">
                      <Button onClick={() => onEdit(customer)} size="sm" variant="secondary">
                        Edit
                      </Button>
                      <Button onClick={() => void onDelete(customer.id)} size="sm" variant="danger">
                        Delete
                      </Button>
                    </div>
                  }
                  fields={[
                    { label: "Phone", value: customer.phone || "-" },
                    { label: "Notes", value: customer.notes || "-" }
                  ]}
                  subtitle="Customer"
                  title={customer.name}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
