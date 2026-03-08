import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeScreen } from "../screens/home/HomeScreen";
import { ProductsScreen } from "../screens/products/ProductsScreen";
import { CustomersScreen } from "../screens/customers/CustomersScreen";
import { OrdersScreen } from "../screens/orders/OrdersScreen";
import { MoreScreen } from "../screens/settings/MoreScreen";
import { InventoryScreen } from "../screens/inventory/InventoryScreen";
import { PaymentsScreen } from "../screens/payments/PaymentsScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { HelpScreen } from "../screens/help/HelpScreen";
import { OrderCreateScreen } from "../screens/orders/OrderCreateScreen";
import { OrderDetailsScreen } from "../screens/orders/OrderDetailsScreen";
import { PaynowCheckoutScreen } from "../screens/payments/PaynowCheckoutScreen";
import { DeliveriesScreen } from "../screens/deliveries/DeliveriesScreen";
import { MainStackParamList, MainTabParamList } from "./types";
import { colors } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function canAccessPayments(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "CASHIER";
}

function canAccessInventory(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "STOCK_CONTROLLER";
}

function getTabLabel(routeName: keyof MainTabParamList) {
  if (routeName === "Home") return "Home";
  if (routeName === "Products") return "Products";
  if (routeName === "Customers") return "Customers";
  if (routeName === "Orders") return "Orders";
  if (routeName === "Payments") return "Payments";
  if (routeName === "Inventory") return "Inventory";
  return "More";
}

function Tabs() {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const showExpandedTabs = width >= 480;
  const showCustomersTab = !showExpandedTabs;
  const showPaymentsTab = showExpandedTabs && canAccessPayments(session?.role);
  const showInventoryTab = showExpandedTabs && canAccessInventory(session?.role);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: "#FFFFFF",
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.slate,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingHorizontal: 12
        },
        tabBarItemStyle: styles.tabItem,
        tabBarLabel: ({ focused, color }) => (
          <View style={[styles.tabPill, focused && styles.tabPillActive]}>
            <Text style={[styles.tabText, { color }, focused && styles.tabTextActive]}>{getTabLabel(route.name)}</Text>
          </View>
        ),
        tabBarButton:
          (route.name === "Customers" && !showCustomersTab) ||
          (route.name === "Payments" && !showPaymentsTab) ||
          (route.name === "Inventory" && !showInventoryTab)
            ? () => null
            : undefined
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Products" component={ProductsScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: "#FFFFFF"
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="OrderCreate" component={OrderCreateScreen} options={{ title: "New Order" }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: "Order Details" }} />
      <Stack.Screen name="PaynowCheckout" component={PaynowCheckoutScreen} options={{ title: "Paynow" }} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Deliveries" component={DeliveriesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    flex: 1,
    minHeight: 46
  },
  tabPill: {
    minWidth: "100%",
    minHeight: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabPillActive: {
    backgroundColor: "rgba(11, 31, 59, 0.08)",
    borderBottomColor: colors.navy
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center"
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: "800"
  }
});
