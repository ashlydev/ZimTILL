import React from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { colors } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { apiRequest } from "../../services/api";

type Delivery = {
  id: string;
  status: "PENDING" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED";
  updatedAt: string;
  order?: {
    orderNumber: string;
  } | null;
};

export function DeliveriesScreen() {
  const { session } = useAuth();
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ deliveries: Delivery[] }>("/deliveries", {
        token: session.token
      });
      setDeliveries(response.deliveries);
    } catch (error) {
      Alert.alert("Deliveries", error instanceof Error ? error.message : "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: Delivery["status"]) => {
    if (!session?.token) return;
    try {
      await apiRequest(`/deliveries/${id}/status`, {
        method: "POST",
        token: session.token,
        body: { status }
      });
      await load();
    } catch (error) {
      Alert.alert("Update failed", error instanceof Error ? error.message : "Could not update delivery");
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Deliveries</Text>
      <Text style={styles.subtitle}>Assigned rider tasks and live status updates.</Text>
      <Card>
        <AppButton label={loading ? "Refreshing..." : "Refresh"} onPress={() => void load()} />
      </Card>
      {deliveries.map((delivery) => (
        <Card key={delivery.id}>
          <View style={styles.row}>
            <Text style={styles.order}>{delivery.order?.orderNumber ?? delivery.id}</Text>
            <Text style={styles.badge}>{delivery.status}</Text>
          </View>
          <Text style={styles.meta}>Updated {new Date(delivery.updatedAt).toLocaleString()}</Text>
          <View style={styles.actions}>
            {delivery.status !== "PICKED_UP" && delivery.status !== "DELIVERED" ? (
              <AppButton label="Picked Up" variant="secondary" onPress={() => void updateStatus(delivery.id, "PICKED_UP")} />
            ) : null}
            {delivery.status !== "DELIVERED" ? (
              <AppButton label="Delivered" onPress={() => void updateStatus(delivery.id, "DELIVERED")} />
            ) : null}
          </View>
        </Card>
      ))}
      {!loading && deliveries.length === 0 ? (
        <Card>
          <Text style={styles.meta}>No deliveries assigned yet.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.navy,
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.slate,
    fontSize: 13
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  order: {
    color: colors.darkSoft,
    fontSize: 16,
    fontWeight: "700"
  },
  badge: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: "800"
  },
  meta: {
    color: colors.slate,
    fontSize: 12
  },
  actions: {
    gap: 8
  }
});
