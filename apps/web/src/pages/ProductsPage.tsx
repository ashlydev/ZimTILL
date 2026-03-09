import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { Category, Product } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

const emptyForm = {
  name: "",
  price: "",
  cost: "",
  sku: "",
  categoryId: "",
  stockQty: "0",
  lowStockThreshold: "5"
};

export function ProductsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const categoryName = (product: Product) => categoryById.get(product.categoryId ?? "")?.name ?? product.category ?? "Uncategorized";

  const productColumns: Array<TableColumn<Product>> = useMemo(
    () => [
      {
        key: "name",
        header: "Product",
        render: (product) => (
          <div>
            <strong>{product.name}</strong>
            <p className="subtle-text">{product.sku || "No SKU"}</p>
          </div>
        )
      },
      {
        key: "category",
        header: "Category",
        render: (product) => categoryName(product)
      },
      {
        key: "price",
        header: "Price",
        render: (product) => formatMoney(Number(product.price))
      },
      {
        key: "stock",
        header: "Stock",
        render: (product) => product.stockQty
      },
      {
        key: "threshold",
        header: "Low Threshold",
        render: (product) => product.lowStockThreshold
      }
    ],
    [categoryById]
  );

  const refresh = async () => {
    if (!token) return;
    setError("");

    try {
      const [productResult, categoryResult] = await Promise.all([
        api.listProducts(token, search, lowStockOnly, null, selectedCategoryId),
        api.listCategories(token)
      ]);
      setProducts(productResult.products);
      setCategories(categoryResult.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load products");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, search, lowStockOnly, selectedCategoryId]);

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

    try {
      const payload = {
        name: form.name.trim(),
        price: Number(form.price),
        cost: form.cost ? Number(form.cost) : null,
        sku: form.sku.trim() || null,
        categoryId: form.categoryId || null,
        stockQty: Number(form.stockQty),
        lowStockThreshold: Number(form.lowStockThreshold)
      };

      if (editingId) {
        await api.updateProduct(token, editingId, payload);
      } else {
        await api.createProduct(token, payload);
      }

      resetForm();
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save product");
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (product: Product) => {
    setEditingId(product.id);
    setShowForm(true);
    setForm({
      name: product.name,
      price: String(product.price),
      cost: product.cost != null ? String(product.cost) : "",
      sku: product.sku ?? "",
      categoryId: product.categoryId ?? "",
      stockQty: String(product.stockQty),
      lowStockThreshold: String(product.lowStockThreshold)
    });
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Delete this product?")) return;
    setError("");
    try {
      await api.deleteProduct(token, id);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete product");
    }
  };

  const onAdjust = async (product: Product) => {
    if (!token) return;
    const quantityValue = window.prompt(`Adjust stock for ${product.name}. Use + or - value.`, "0");
    if (!quantityValue) return;

    const quantity = Number(quantityValue);
    if (Number.isNaN(quantity)) {
      setError("Invalid adjustment quantity");
      return;
    }

    const reason = window.prompt("Reason (optional)", "Manual stock adjustment") ?? undefined;
    setError("");
    try {
      await api.adjustStock(token, product.id, quantity, reason);
      await refresh();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "Failed to adjust stock");
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
            {showForm && !editingId ? "Close Form" : "Add Product"}
          </Button>
        }
        subtitle="Manage catalog pricing, stock levels, thresholds, and product categories."
        title="Products"
      />

      <Card>
        <div className="filters-row">
          <div className="filters-left filters-left-wide">
            <Input label="Search" onChange={(event) => setSearch(event.target.value)} placeholder="Search by product name or SKU" value={search} />
            <Select label="Category Filter" onChange={(event) => setSelectedCategoryId(event.target.value)} value={selectedCategoryId}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <label className="checkbox-row">
              <input checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} type="checkbox" />
              <span>Low stock only</span>
            </label>
          </div>
          <div className="filters-right">
            <Button onClick={() => navigate("/categories")} variant="ghost">
              Manage Categories
            </Button>
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
          title={editingId ? "Edit Product" : "Add Product"}
        >
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="form-grid">
              <Input label="Name" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
              <Input
                label="Price"
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                required
                step="0.01"
                type="number"
                value={form.price}
              />
              <Input
                label="Cost"
                onChange={(event) => setForm((prev) => ({ ...prev, cost: event.target.value }))}
                step="0.01"
                type="number"
                value={form.cost}
              />
              <Input label="SKU" onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))} value={form.sku} />
              <Select label="Category" onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))} value={form.categoryId}>
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <div className="form-field category-helper-field">
                <span className="form-label">Categories</span>
                <Button onClick={() => navigate("/categories")} variant="secondary">
                  Open Categories
                </Button>
              </div>
              <Input
                label="Stock Quantity"
                onChange={(event) => setForm((prev) => ({ ...prev, stockQty: event.target.value }))}
                required
                type="number"
                value={form.stockQty}
              />
              <Input
                label="Low Stock Threshold"
                onChange={(event) => setForm((prev) => ({ ...prev, lowStockThreshold: event.target.value }))}
                required
                type="number"
                value={form.lowStockThreshold}
              />
            </div>

            <div className="actions-row">
              <Button disabled={busy} type="submit" variant="primary">
                {busy ? "Saving..." : editingId ? "Update Product" : "Create Product"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {error ? <p className="status-text error">{error}</p> : null}

      <Card subtitle="Inventory and pricing overview" title="Product List">
        {products.length === 0 ? (
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
                Add Product
              </Button>
            }
            description="Add your first product to start creating orders."
            title="No products found"
          />
        ) : (
          <>
            <div className="desktop-only">
              <Table
                columns={[
                  ...productColumns,
                  {
                    key: "actions",
                    header: "Actions",
                    render: (product) => (
                      <div className="table-actions">
                        <Button onClick={() => onEdit(product)} size="sm" variant="secondary">
                          Edit
                        </Button>
                        <Button onClick={() => void onAdjust(product)} size="sm" variant="ghost">
                          Adjust
                        </Button>
                        <Button onClick={() => void onDelete(product.id)} size="sm" variant="danger">
                          Delete
                        </Button>
                      </div>
                    )
                  }
                ]}
                rowKey={(product) => product.id}
                rows={products}
              />
            </div>

            <div className="mobile-only card-stack">
              {products.map((product) => (
                <ListCard
                  key={product.id}
                  actions={
                    <div className="list-inline-actions">
                      <Button onClick={() => onEdit(product)} size="sm" variant="secondary">
                        Edit
                      </Button>
                      <Button onClick={() => void onAdjust(product)} size="sm" variant="ghost">
                        Adjust
                      </Button>
                      <Button onClick={() => void onDelete(product.id)} size="sm" variant="danger">
                        Delete
                      </Button>
                    </div>
                  }
                  fields={[
                    { label: "Category", value: categoryName(product) },
                    { label: "Price", value: formatMoney(Number(product.price)) },
                    { label: "Stock", value: product.stockQty },
                    { label: "Low Threshold", value: product.lowStockThreshold }
                  ]}
                  subtitle={product.sku || "No SKU"}
                  title={product.name}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
