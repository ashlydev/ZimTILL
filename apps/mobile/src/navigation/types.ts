export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Products: undefined;
  Customers: undefined;
  Orders: undefined;
  More: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  OrderCreate: undefined;
  OrderDetails: { orderId: string };
  PaynowCheckout: { orderId: string; amount: number };
  Inventory: undefined;
  Reports: undefined;
  Settings: undefined;
  Help: undefined;
};
