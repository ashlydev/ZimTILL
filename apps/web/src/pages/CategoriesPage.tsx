import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Category } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

const columns: Array<TableColumn<Category>> = [
  {
    key: "name",
    header: "Category",
    render: (category) => category.name
  },
  {
    key: "updatedAt",
    header: "Updated",
    render: (category) => new Date(category.updatedAt).toLocaleString()
  }
];

export function CategoriesPage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!token) return;
    setError("");
    try {
      const result = await api.listCategories(token);
      setCategories(result.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load categories");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const reset = () => {
    setEditingId(null);
    setName("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await api.updateCategory(token, editingId, { name: name.trim() });
      } else {
        await api.createCategory(token, { name: name.trim() });
      }
      reset();
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save category");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (category: Category) => {
    if (!token) return;
    if (!window.confirm(`Delete ${category.name}? Products will stay available.`)) return;
    setError("");
    try {
      await api.deleteCategory(token, category.id);
      await refresh();
      if (editingId === category.id) {
        reset();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete category");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader subtitle="Create, rename, and retire product categories without changing the rest of your catalog." title="Categories" />

      <Card title={editingId ? "Edit Category" : "Add Category"}>
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="form-grid category-form-grid">
            <Input label="Category Name" onChange={(event) => setName(event.target.value)} placeholder="e.g. Power Tools" required value={name} />
            <div className="form-field category-helper-field">
              <span className="form-label">Actions</span>
              <div className="actions-row wrap">
                <Button disabled={busy} type="submit" variant="primary">
                  {busy ? "Saving..." : editingId ? "Update Category" : "Create Category"}
                </Button>
                {editingId ? (
                  <Button onClick={reset} variant="ghost">
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </Card>

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Categories are synced merchant-wide and can be reused in product filters and reports." title="Category List">
        {categories.length === 0 ? (
          <EmptyState description="Add your first category to organize your products and reporting." title="No categories yet" />
        ) : (
          <>
            <div className="desktop-only">
              <Table
                columns={[
                  ...columns,
                  {
                    key: "actions",
                    header: "Actions",
                    render: (category) => (
                      <div className="table-actions">
                        <Button
                          onClick={() => {
                            setEditingId(category.id);
                            setName(category.name);
                          }}
                          size="sm"
                          variant="secondary"
                        >
                          Edit
                        </Button>
                        <Button onClick={() => void onDelete(category)} size="sm" variant="danger">
                          Delete
                        </Button>
                      </div>
                    )
                  }
                ]}
                rowKey={(category) => category.id}
                rows={categories}
              />
            </div>
            <div className="mobile-only card-stack">
              {categories.map((category) => (
                <ListCard
                  key={category.id}
                  actions={
                    <div className="list-inline-actions">
                      <Button
                        onClick={() => {
                          setEditingId(category.id);
                          setName(category.name);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Edit
                      </Button>
                      <Button onClick={() => void onDelete(category)} size="sm" variant="danger">
                        Delete
                      </Button>
                    </div>
                  }
                  fields={[{ label: "Updated", value: new Date(category.updatedAt).toLocaleString() }]}
                  subtitle="Category"
                  title={category.name}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
