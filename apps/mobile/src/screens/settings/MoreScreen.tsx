import React from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { colors } from "../../constants/theme";
import { getFeatureFlags } from "../../data/repository";
import { useAuth } from "../../contexts/AuthContext";

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const [flags, setFlags] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!session) return;
    getFeatureFlags(session.merchantId).then(setFlags).catch(() => undefined);
  }, [session]);

  return (
    <Screen>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitleMeta}>Extra tools and support screens.</Text>
      <Card>
        <AppButton label="Inventory" onPress={() => navigation.navigate("Inventory")} />
        <AppButton label="Reports" onPress={() => navigation.navigate("Reports")} />
        {session?.role === "DELIVERY_RIDER" || flags["DELIVERY_MODE"] ? (
          <AppButton label="Deliveries" onPress={() => navigation.navigate("Deliveries")} />
        ) : null}
        <AppButton label="Settings" onPress={() => navigation.navigate("Settings")} />
        <AppButton label="Help" onPress={() => navigation.navigate("Help")} />
      </Card>
      {(flags["v2.staffAccounts"] || flags["v2.multiBranch"] || flags["v2.subscriptionBilling"]) ? (
        <Card>
          <Text style={styles.subtitle}>V2 Preview (feature-flagged)</Text>
          {flags["v2.staffAccounts"] ? (
            <AppButton label="Staff Accounts (V2)" variant="secondary" onPress={() => Alert.alert("Not yet", "This V2 feature is not implemented in V1.")} />
          ) : null}
          {flags["v2.multiBranch"] ? (
            <AppButton label="Multi-Branch (V2)" variant="secondary" onPress={() => Alert.alert("Not yet", "This V2 feature is not implemented in V1.")} />
          ) : null}
          {flags["v2.subscriptionBilling"] ? (
            <AppButton label="Subscriptions (V2)" variant="secondary" onPress={() => Alert.alert("Not yet", "This V2 feature is not implemented in V1.")} />
          ) : null}
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
  subtitleMeta: {
    color: colors.slate,
    fontSize: 13
  },
  subtitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  }
});
