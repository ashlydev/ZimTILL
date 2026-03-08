import React, { useMemo, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileDrawer } from "../components/MobileDrawer";
import { colors } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { CustomersScreen } from "../screens/customers/CustomersScreen";
import { DeliveriesScreen } from "../screens/deliveries/DeliveriesScreen";
import { HelpScreen } from "../screens/help/HelpScreen";
import { HomeScreen } from "../screens/home/HomeScreen";
import { DamagedGoodsScreen } from "../screens/inventory/DamagedGoodsScreen";
import { ExpiredGoodsScreen } from "../screens/inventory/ExpiredGoodsScreen";
import { InventoryScreen } from "../screens/inventory/InventoryScreen";
import { ReturnsScreen } from "../screens/inventory/ReturnsScreen";
import { OrderCreateScreen } from "../screens/orders/OrderCreateScreen";
import { OrderDetailsScreen } from "../screens/orders/OrderDetailsScreen";
import { OrdersScreen } from "../screens/orders/OrdersScreen";
import { PaymentsScreen } from "../screens/payments/PaymentsScreen";
import { PaynowCheckoutScreen } from "../screens/payments/PaynowCheckoutScreen";
import { ProductsScreen } from "../screens/products/ProductsScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { SyncStatusScreen } from "../screens/settings/SyncStatusScreen";
import { MainStackParamList, MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

type TabsProps = NativeStackScreenProps<MainStackParamList, "Tabs">;

function canAccessPayments(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "CASHIER";
}

function canAccessInventory(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "STOCK_CONTROLLER";
}

function canAccessCustomers(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "CASHIER";
}

function canAccessDeliveries(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "DELIVERY_RIDER";
}

function getTabLabel(routeName: keyof MainTabParamList) {
  if (routeName === "Home") return "Dashboard";
  return routeName;
}

function getDrawerItems(role: string | null | undefined, navigate: TabsProps["navigation"]["navigate"], close: () => void) {
  const items: Array<{ key: string; label: string; icon: string; onPress: () => void }> = [];

  if (canAccessCustomers(role)) {
    items.push({
      key: "customers",
      label: "Customers",
      icon: "CU",
      onPress: () => {
        close();
        navigate("Customers");
      }
    });
  }

  if (canAccessPayments(role)) {
    items.push({
      key: "payments",
      label: "Payments",
      icon: "PY",
      onPress: () => {
        close();
        navigate("Payments");
      }
    });
  }

  if (canAccessInventory(role)) {
    items.push(
      {
        key: "inventory",
        label: "Inventory",
        icon: "IV",
        onPress: () => {
          close();
          navigate("Inventory");
        }
      },
      {
        key: "returns",
        label: "Returns",
        icon: "RT",
        onPress: () => {
          close();
          navigate("Returns");
        }
      },
      {
        key: "expired",
        label: "Expired",
        icon: "EX",
        onPress: () => {
          close();
          navigate("ExpiredGoods");
        }
      },
      {
        key: "damaged",
        label: "Damaged",
        icon: "DG",
        onPress: () => {
          close();
          navigate("DamagedGoods");
        }
      }
    );
  }

  if (canAccessDeliveries(role)) {
    items.push({
      key: "deliveries",
      label: "Deliveries",
      icon: "DL",
      onPress: () => {
        close();
        navigate("Deliveries");
      }
    });
  }

  items.push({
    key: "sync-status",
    label: "Sync Status",
    icon: "SY",
    onPress: () => {
      close();
      navigate("SyncStatus");
    }
  });

  items.push({
    key: "help",
    label: "Help",
    icon: "HP",
    onPress: () => {
      close();
      navigate("Help");
    }
  });

  return items;
}

function Tabs({ navigation }: TabsProps) {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isCompact = width < 360;
  const drawerItems = useMemo(
    () => getDrawerItems(session?.role, navigation.navigate, () => setDrawerOpen(false)),
    [navigation.navigate, session?.role]
  );

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: "#FFFFFF",
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "800", fontSize: 18 },
          headerTitle: getTabLabel(route.name),
          headerLeft: () => (
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton}>
              <Text style={styles.menuIcon}>≡</Text>
              <Text style={styles.menuText}>Menu</Text>
            </Pressable>
          ),
          tabBarActiveTintColor: colors.navy,
          tabBarInactiveTintColor: colors.slate,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: "#FFFFFF",
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 66 + insets.bottom,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 10),
            paddingHorizontal: 10
          },
          tabBarItemStyle: styles.tabItem,
          tabBarLabel: ({ focused, color }) => (
            <View style={[styles.tabPill, focused && styles.tabPillActive, isCompact && styles.tabPillCompact]}>
              <Text numberOfLines={1} style={[styles.tabText, { color }, focused && styles.tabTextActive, isCompact && styles.tabTextCompact]}>
                {getTabLabel(route.name)}
              </Text>
            </View>
          )
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Orders" component={OrdersScreen} />
        <Tab.Screen name="Products" component={ProductsScreen} />
        <Tab.Screen name="Reports" component={ReportsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        subtitle={session?.businessName ?? "More pages"}
      />
    </>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: "#FFFFFF",
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800", fontSize: 18 }
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="OrderCreate" component={OrderCreateScreen} options={{ title: "New Order" }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: "Order Details" }} />
      <Stack.Screen name="PaynowCheckout" component={PaynowCheckoutScreen} options={{ title: "Paynow" }} />
      <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: "Customers" }} />
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: "Inventory" }} />
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: "Payments" }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: "Reports" }} />
      <Stack.Screen name="Returns" component={ReturnsScreen} options={{ title: "Returns" }} />
      <Stack.Screen name="ExpiredGoods" component={ExpiredGoodsScreen} options={{ title: "Expired Goods" }} />
      <Stack.Screen name="DamagedGoods" component={DamagedGoodsScreen} options={{ title: "Damaged Goods" }} />
      <Stack.Screen name="SyncStatus" component={SyncStatusScreen} options={{ title: "Sync Status" }} />
      <Stack.Screen name="Deliveries" component={DeliveriesScreen} options={{ title: "Deliveries" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: "Help" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    minHeight: 36
  },
  menuIcon: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 24,
    fontWeight: "800"
  },
  menuText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
  },
  tabItem: {
    flex: 1,
    minHeight: 46
  },
  tabPill: {
    width: "100%",
    minHeight: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabPillCompact: {
    paddingHorizontal: 4
  },
  tabPillActive: {
    backgroundColor: "rgba(11, 31, 59, 0.08)",
    borderBottomColor: colors.navy
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  tabTextCompact: {
    fontSize: 11
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: "800"
  }
});
