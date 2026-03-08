import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";
import type { CatalogSettings, Product } from "../types";

export function CatalogPage() {
  const { token, merchant } = useAuth();
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    merchantSlug: "",
    headline: "",
    description: "",
    isEnabled: false,
    checkoutPolicy: "CONFIRM_ON_PAID" as CatalogSettings["checkoutPolicy"]
  });

  const refresh = async () => {
    if (!token) return;
    const [settingsRes, productsRes] = await Promise.all([api.getCatalogSettings(token), api.listProducts(token)]);
    setSettings(settingsRes.settings);
    setProducts(productsRes.products.filter((product) => product.isPublished !== false));
    if (settingsRes.settings) {
      setForm({
        merchantSlug: settingsRes.settings.merchantSlug,
        headline: settingsRes.settings.headline || "",
        description: settingsRes.settings.description || "",
        isEnabled: settingsRes.settings.isEnabled,
        checkoutPolicy: settingsRes.settings.checkoutPolicy
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const previewUrl = useMemo(() => {
    if (!form.merchantSlug) return "";
    return `/c/${form.merchantSlug}`;
  }, [form.merchantSlug]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      const response = await api.updateCatalogSettings(token, form);
      setSettings(response.settings);
      setMessage("Catalog settings updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update catalog");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        title="Catalog"
        subtitle="Publish a shareable merchant catalog and accept EcoCash checkout through Paynow."
        action={
          previewUrl ? (
            <Link className="ui-button ui-button-secondary" to={previewUrl}>
              Open Catalog
            </Link>
          ) : null
        }
      />

      {message ? <p className="status-text">{message}</p> : null}

      <div className="split-grid">
        <Card title="Catalog Settings" subtitle={`Public merchant profile for ${merchant?.name ?? "your business"}`}>
          <form className="form-stack" onSubmit={onSubmit}>
            <Input label="Merchant slug" value={form.merchantSlug} onChange={(event) => setForm((current) => ({ ...current, merchantSlug: event.target.value }))} />
            <Input label="Headline" value={form.headline} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} />
            <TextArea
              label="Description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
            <Select
              label="Checkout policy"
              value={form.checkoutPolicy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  checkoutPolicy: event.target.value as CatalogSettings["checkoutPolicy"]
                }))
              }
            >
              <option value="CONFIRM_ON_PAID">Confirm order when paid</option>
              <option value="CONFIRM_ON_CREATE">Confirm immediately on checkout</option>
            </Select>
            <label className="checkbox-row">
              <input
                checked={form.isEnabled}
                onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.checked }))}
                type="checkbox"
              />
              <span>Enable public catalog</span>
            </label>
            <Button type="submit" variant="primary">
              Save Catalog
            </Button>
          </form>
        </Card>

        <Card title="Published Products" subtitle="Products marked active are exposed in the public catalog response">
          {products.length === 0 ? (
            <EmptyState title="No products" description="Add products first, then publish the catalog." />
          ) : (
            <div className="card-stack">
              {products.slice(0, 8).map((product) => (
                <ListCard
                  key={product.id}
                  title={product.name}
                  subtitle={product.category || "Uncategorized"}
                  fields={[
                    { label: "Price", value: `$${Number(product.price).toFixed(2)}` },
                    { label: "Stock", value: product.branchStockQty ?? product.stockQty }
                  ]}
                />
              ))}
            </div>
          )}
          {settings ? <p className="subtle-text">Catalog status: {settings.isEnabled ? "Live" : "Hidden"}</p> : null}
        </Card>
      </div>
    </section>
  );
}
