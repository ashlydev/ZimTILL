import { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Orders: undefined;
  Products: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  OrderCreate: undefined;
  OrderDetails: { orderId: string };
  PaynowCheckout: { orderId: string; amount: number };
  Customers: undefined;
  Inventory: undefined;
  Payments: undefined;
  Categories: undefined;
  Reports: undefined;
  Returns: undefined;
  ExpiredGoods: undefined;
  DamagedGoods: undefined;
  SyncStatus: undefined;
  Deliveries: undefined;
  Settings: undefined;
  Help: undefined;
};
