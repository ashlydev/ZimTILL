import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDateTime, formatOrderStatus } from "../lib/format";
import type { Product, StockTransfer } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";

export function TransfersPage() {
  const { token, branches } = useAuth();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    if (!token) return;
    const [transfersRes, productsRes] = await Promise.all([api.listTransfers(token), api.listProducts(token)]);
    setTransfers(transfersRes.transfers);
    setProducts(productsRes.products);
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  useEffect(() => {
    if (!fromBranchId && branches[0]) setFromBranchId(branches[0].id);
    if (!toBranchId && branches[1]) setToBranchId(branches[1].id);
  }, [branches, fromBranchId, toBranchId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await api.createTransfer(token, {
        fromBranchId,
        toBranchId,
        notes,
        items: [{ productId, quantity: Number(quantity) }]
      });
      setMessage("Transfer created.");
      setNotes("");
      setQuantity("1");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create transfer");
    }
  };

  const approve = async (id: string) => {
    if (!token) return;
    await api.approveTransfer(token, id);
    await refresh();
  };

  const receive = async (id: string) => {
    if (!token) return;
    await api.receiveTransfer(token, id);
    await refresh();
  };

  return (
    <section className="page-stack">
      <PageHeader title="Transfers" subtitle="Move stock between branches with approval and receiving workflow." />
      {message ? <p className="status-text">{message}</p> : null}

      <div className="split-grid">
        <Card title="New Transfer" subtitle="Basic workflow for branch-to-branch stock movement">
          <form className="form-stack" onSubmit={onSubmit}>
            <Select label="From branch" value={fromBranchId} onChange={(event) => setFromBranchId(event.target.value)}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Select label="To branch" value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Select label="Product" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
            <Input label="Quantity" min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <TextArea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <Button type="submit" variant="primary">
              Create Transfer
            </Button>
          </form>
        </Card>

        <Card title="Transfer Queue" subtitle="Approve and receive from the same screen for now">
          <div className="card-stack">
            {transfers.map((transfer) => (
              <ListCard
                key={transfer.id}
                title={`${transfer.fromBranch?.name ?? "From"} -> ${transfer.toBranch?.name ?? "To"}`}
                subtitle={`Updated ${formatDateTime(transfer.updatedAt)}`}
                badge={<span className={`status-badge status-${transfer.status.toLowerCase().replace(/_/g, "-")}`}>{formatOrderStatus(transfer.status)}</span>}
                fields={[
                  { label: "Items", value: transfer.items?.map((item) => `${item.product?.name ?? "Product"} x${Number(item.quantity)}`).join(", ") || "No items" },
                  { label: "Notes", value: transfer.notes || "None" }
                ]}
                actions={
                  <div className="inline-actions">
                    {transfer.status === "DRAFT" ? (
                      <Button size="sm" variant="secondary" onClick={() => void approve(transfer.id)}>
                        Approve
                      </Button>
                    ) : null}
                    {transfer.status === "APPROVED" || transfer.status === "IN_TRANSIT" ? (
                      <Button size="sm" variant="primary" onClick={() => void receive(transfer.id)}>
                        Receive
                      </Button>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
