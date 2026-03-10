import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { Customer, Product } from "../types";
import { getButtonClassName, Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

type DraftItem = { productId: string; quantity: number };

type DraftRow = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

const itemColumns: Array<TableColumn<DraftRow>> = [
  {
    key: "item",
    header: "Item",
    render: (item) => item.name
  },
  {
    key: "qty",
    header: "Qty",
    render: (item) => item.quantity
  },
  {
    key: "unit",
    header: "Unit",
    render: (item) => formatMoney(item.unitPrice)
  },
  {
    key: "lineTotal",
    header: "Line Total",
    render: (item) => formatMoney(item.unitPrice * item.quantity)
  }
];

export function OrderCreatePage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    const boot = async () => {
      try {
        const [productsRes, customersRes] = await Promise.all([api.listProducts(token), api.listCustomers(token)]);
        setProducts(productsRes.products);
        setCustomers(customersRes.customers);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load order options");
      }
    };

    void boot();
  }, [token]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = productById.get(item.productId);
        return sum + (product ? Number(product.price) * item.quantity : 0);
      }, 0),
    [items, productById]
  );

  const discount = useMemo(() => {
    const amount = Number(discountAmount || 0);
    const percent = Number(discountPercent || 0);
    if (amount > 0) return amount;
    return subtotal * (percent / 100);
  }, [subtotal, discountAmount, discountPercent]);

  const total = Math.max(subtotal - discount, 0);

  const draftRows = useMemo(() => {
    return items
      .map((item) => {
        const product = productById.get(item.productId);
        if (!product) return null;
        return {
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          unitPrice: Number(product.price)
        };
      })
      .filter((item): item is DraftRow => Boolean(item));
  }, [items, productById]);

  const addItem = () => {
    if (!selectedProduct || quantity <= 0) return;
    const existing = items.find((item) => item.productId === selectedProduct);
    if (existing) {
      setItems((prev) => prev.map((item) => (item.productId === selectedProduct ? { ...item, quantity: item.quantity + quantity } : item)));
    } else {
      setItems((prev) => [...prev, { productId: selectedProduct, quantity }]);
    }
    setQuantity(1);
    setSelectedProduct("");
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (items.length === 0) {
      setError("Add at least one item");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const payload = {
        customerId: selectedCustomer || null,
        items,
        discountAmount: Number(discountAmount || 0),
        discountPercent: Number(discountPercent || 0),
        notes: notes.trim() || undefined
      };

      const result = await api.createOrder(token, payload);
      navigate(`/orders/${result.order.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        action={
          <Link className={getButtonClassName("ghost")} to="/orders">
            Back to Orders
          </Link>
        }
        subtitle="Build an order with products, discounts, and payment-ready totals."
        title="Create Order"
      />

      <form className="page-stack" onSubmit={onSubmit}>
        <Card subtitle="Select customer and add products" title="Order Setup">
          <div className="form-grid">
            <Select label="Customer (optional)" onChange={(event) => setSelectedCustomer(event.target.value)} value={selectedCustomer}>
              <option value="">Walk-in Customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>

            <Select label="Product" onChange={(event) => setSelectedProduct(event.target.value)} value={selectedProduct}>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({formatMoney(Number(product.price))})
                </option>
              ))}
            </Select>

            <Input label="Quantity" min={1} onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} />
          </div>

          <div className="actions-row">
            <Button onClick={addItem} variant="secondary">
              Add Item
            </Button>
          </div>
        </Card>

        <Card subtitle="Apply amount or percentage discounts" title="Pricing & Notes">
          <div className="form-grid">
            <Input
              label="Discount Amount"
              onChange={(event) => setDiscountAmount(event.target.value)}
              step="0.01"
              type="number"
              value={discountAmount}
            />
            <Input
              label="Discount %"
              onChange={(event) => setDiscountPercent(event.target.value)}
              step="0.01"
              type="number"
              value={discountPercent}
            />
            <TextArea
              containerClassName="span-2"
              label="Notes"
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              value={notes}
            />
          </div>
        </Card>

        <Card subtitle="Review and remove lines before submitting" title="Order Items">
          {draftRows.length === 0 ? (
            <EmptyState description="Add at least one product from Order Setup." title="No items yet" />
          ) : (
            <>
              <div className="desktop-only">
                <Table
                  columns={[
                    ...itemColumns,
                    {
                      key: "actions",
                      header: "",
                      render: (row) => (
                        <Button onClick={() => removeItem(row.productId)} size="sm" variant="danger">
                          Remove
                        </Button>
                      )
                    }
                  ]}
                  rowKey={(row) => row.productId}
                  rows={draftRows}
                />
              </div>
              <div className="mobile-only card-stack">
                {draftRows.map((row) => (
                  <ListCard
                    key={row.productId}
                    actions={
                      <Button onClick={() => removeItem(row.productId)} size="sm" variant="danger">
                        Remove
                      </Button>
                    }
                    fields={[
                      { label: "Qty", value: row.quantity },
                      { label: "Unit", value: formatMoney(row.unitPrice) },
                      { label: "Line Total", value: formatMoney(row.unitPrice * row.quantity) }
                    ]}
                    subtitle="Product"
                    title={row.name}
                  />
                ))}
              </div>
            </>
          )}
        </Card>

        <Card subtitle="Final totals" title="Summary">
          <div className="summary-inline">
            <p>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </p>
            <p>
              <span>Discount</span>
              <strong>{formatMoney(discount)}</strong>
            </p>
            <p>
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </p>
          </div>

          {error ? <p className="status-text error">{error}</p> : null}

          <div className="actions-row">
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </Card>
      </form>
    </section>
  );
}
