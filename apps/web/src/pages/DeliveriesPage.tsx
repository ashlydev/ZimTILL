import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { formatDateTime, formatOrderStatus } from "../lib/format";
import type { Delivery, Order, StaffUser } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/FormControls";
import { ListCard } from "../components/ui/ListCard";
import { PageHeader } from "../components/ui/PageHeader";

export function DeliveriesPage() {
  const { token, user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [orderId, setOrderId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [proofPhotoUrl, setProofPhotoUrl] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    if (!token) return;
    const [deliveriesRes, ordersRes, staffRes] = await Promise.all([api.listDeliveries(token), api.listOrders(token), api.listStaff(token)]);
    setDeliveries(deliveriesRes.deliveries);
    setOrders(ordersRes.orders);
    setStaff(staffRes.staff.filter((member) => member.role === "DELIVERY_RIDER"));
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await api.assignDelivery(token, { orderId, assignedToUserId: assignedToUserId || null });
      setOrderId("");
      setAssignedToUserId("");
      setMessage("Delivery assigned.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to assign delivery");
    }
  };

  const markPickedUp = async (id: string) => {
    if (!token) return;
    await api.updateDeliveryStatus(token, id, { status: "PICKED_UP" });
    await refresh();
  };

  const markDelivered = async (id: string) => {
    if (!token) return;
    await api.updateDeliveryStatus(token, id, { status: "DELIVERED", proofPhotoUrl });
    setProofPhotoUrl("");
    await refresh();
  };

  return (
    <section className="page-stack">
      <PageHeader title="Deliveries" subtitle="Assign riders, track pickup and delivery status, and capture proof URLs." />
      {message ? <p className="status-text">{message}</p> : null}

      {user?.role !== "DELIVERY_RIDER" ? (
        <Card title="Assign Delivery" subtitle="Create or update a delivery assignment for an order">
          <form className="form-grid" onSubmit={assign}>
            <Select label="Order" value={orderId} onChange={(event) => setOrderId(event.target.value)}>
              <option value="">Select order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber}
                </option>
              ))}
            </Select>
            <Select label="Rider" value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.identifier}
                </option>
              ))}
            </Select>
            <div className="span-2">
              <Button type="submit" variant="primary">
                Save Assignment
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Delivery Board" subtitle="Use this board for rider and merchant status updates">
        {deliveries.length === 0 ? (
          <EmptyState title="No deliveries" description="Assign an order to a rider to begin delivery tracking." />
        ) : (
          <div className="card-stack">
            {deliveries.map((delivery) => (
              <ListCard
                key={delivery.id}
                title={delivery.order?.orderNumber ?? delivery.orderId}
                subtitle={delivery.assignedTo?.identifier ?? "Unassigned"}
                badge={<span className={`status-badge status-${delivery.status.toLowerCase().replace(/_/g, "-")}`}>{formatOrderStatus(delivery.status)}</span>}
                fields={[
                  { label: "Updated", value: formatDateTime(delivery.updatedAt) },
                  { label: "Delivered", value: delivery.deliveredAt ? formatDateTime(delivery.deliveredAt) : "Not yet" }
                ]}
                actions={
                  <div className="inline-actions">
                    {delivery.status !== "PICKED_UP" && delivery.status !== "DELIVERED" ? (
                      <Button size="sm" variant="secondary" onClick={() => void markPickedUp(delivery.id)}>
                        Picked Up
                      </Button>
                    ) : null}
                    {delivery.status !== "DELIVERED" ? (
                      <>
                        <Input
                          containerClassName="inline-proof"
                          label="Proof URL"
                          value={proofPhotoUrl}
                          onChange={(event) => setProofPhotoUrl(event.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void markDelivered(delivery.id)}
                        >
                          Delivered
                        </Button>
                      </>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
