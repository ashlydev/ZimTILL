import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { CatalogPublicPayload, Product } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select, TextArea } from "../components/ui/FormControls";

type CartRow = {
  product: Product;
  quantity: number;
};

export function PublicCatalogPage() {
  const { merchantSlug = "" } = useParams();
  const [payload, setPayload] = useState<CatalogPublicPayload | null>(null);
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<"ECOCASH" | "PAY_LATER">("ECOCASH");
  const [cart, setCart] = useState<CartRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!merchantSlug) return;
    void api
      .getPublicCatalog(merchantSlug)
      .then(setPayload)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load catalog"));
  }, [merchantSlug]);

  const filteredProducts = useMemo(() => {
    const products = payload?.products ?? [];
    if (!search.trim()) return products;
    return products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  }, [payload, search]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0), [cart]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const checkout = async () => {
    if (!merchantSlug || cart.length === 0) return;
    try {
      const response = await api.checkoutPublicCatalog(merchantSlug, {
        customerName,
        customerPhone,
        notes,
        paymentMode,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity
        }))
      });

      const paynowInstructions =
        response.paynow && "instructions" in response.paynow ? String(response.paynow.instructions ?? "") : "";
      setMessage(`Checkout created for ${response.order.orderNumber}. ${paynowInstructions}`.trim());
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed");
    }
  };

  return (
    <div className="catalog-shell">
      <section className="catalog-hero">
        <p className="sidebar-kicker">Novoriq Catalog</p>
        <h1>{payload?.settings.headline || payload?.merchant?.name || "Online Catalog"}</h1>
        <p>{payload?.settings.description || "Browse products and pay online with EcoCash."}</p>
      </section>

      {message ? <p className="status-text">{message}</p> : null}

      <div className="catalog-layout">
        <section className="catalog-products">
          <Card title="Products" subtitle="Shareable catalog checkout for WhatsApp-first merchants">
            <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
            {filteredProducts.length === 0 ? (
              <EmptyState title="No products" description="This catalog has no visible products yet." />
            ) : (
              <div className="catalog-grid">
                {filteredProducts.map((product) => (
                  <article key={product.id} className="catalog-product-card">
                    <div>
                      <h3>{product.name}</h3>
                      <p className="subtle-text">{product.category || "General"}</p>
                    </div>
                    <strong>{formatMoney(Number(product.price))}</strong>
                    <p className="subtle-text">Available: {product.branchStockQty ?? product.stockQty}</p>
                    <Button variant="primary" onClick={() => addToCart(product)}>
                      Add to cart
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </section>

        <aside className="catalog-checkout">
          <Card title="Checkout" subtitle="Customer checkout creates an online order in the merchant workspace">
            <div className="cart-summary">
              {cart.length === 0 ? <p className="subtle-text">Cart is empty.</p> : null}
              {cart.map((item) => (
                <div key={item.product.id} className="metric-list-row">
                  <span>
                    {item.product.name} x{item.quantity}
                  </span>
                  <strong>{formatMoney(Number(item.product.price) * item.quantity)}</strong>
                </div>
              ))}
              <div className="metric-list-row">
                <span>Total</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>
            <Input label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
            <Input label="Customer phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
            <Select label="Payment mode" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "ECOCASH" | "PAY_LATER")}>
              <option value="ECOCASH">Pay with EcoCash</option>
              <option value="PAY_LATER">Pay later</option>
            </Select>
            <TextArea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <Button disabled={cart.length === 0} onClick={() => void checkout()} variant="primary">
              Checkout
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
