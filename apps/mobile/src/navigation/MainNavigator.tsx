import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../screens/home/HomeScreen";
import { ProductsScreen } from "../screens/products/ProductsScreen";
import { CustomersScreen } from "../screens/customers/CustomersScreen";
import { OrdersScreen } from "../screens/orders/OrdersScreen";
import { MoreScreen } from "../screens/settings/MoreScreen";
import { InventoryScreen } from "../screens/inventory/InventoryScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { HelpScreen } from "../screens/help/HelpScreen";
import { OrderCreateScreen } from "../screens/orders/OrderCreateScreen";
import { OrderDetailsScreen } from "../screens/orders/OrderDetailsScreen";
import { PaynowCheckoutScreen } from "../screens/payments/PaynowCheckoutScreen";
import { DeliveriesScreen } from "../screens/deliveries/DeliveriesScreen";
import { MainStackParamList, MainTabParamList } from "./types";
import { colors } from "../constants/theme";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: "#FFFFFF",
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.slate,
        tabBarStyle: { backgroundColor: "#FFFFFF" }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Products" component={ProductsScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
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
      <Stack.Screen name="Inventory" component={InventoryScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Deliveries" component={DeliveriesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
    </Stack.Navigator>
  );
}
