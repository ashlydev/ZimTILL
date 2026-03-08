export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Products: undefined;
  Customers: undefined;
  Orders: undefined;
  Payments: undefined;
  Inventory: undefined;
  More: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  OrderCreate: undefined;
  OrderDetails: { orderId: string };
  PaynowCheckout: { orderId: string; amount: number };
  Reports: undefined;
  Deliveries: undefined;
  Settings: undefined;
  Help: undefined;
};
