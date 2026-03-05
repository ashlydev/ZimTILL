import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors } from "../../constants/theme";

export function HelpScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Help</Text>
        <Text style={styles.subtitle}>Quick answers for daily use.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>1. Create a product</Text>
        <Text style={styles.meta}>Go to Products, fill name, price, stock, then tap Save.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>2. Create an order</Text>
        <Text style={styles.meta}>Open Orders, tap New order, add quantities, and create the order.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>3. Share on WhatsApp</Text>
        <Text style={styles.meta}>From Order details, tap Share to WhatsApp. Message is generated from your template.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>4. Accept Paynow payments</Text>
        <Text style={styles.meta}>From Order details, tap Pay with Paynow, choose method, initiate, then check status.</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>5. Offline mode and sync</Text>
        <Text style={styles.meta}>
          You can create and edit products, customers, orders, payments and inventory while offline. Changes queue in outbox and sync automatically when online or when Sync now is tapped.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    padding: 20,
    gap: 4
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: "#C7D2E2",
    fontSize: 13
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  meta: {
    color: colors.slate,
    fontSize: 13
  }
});
