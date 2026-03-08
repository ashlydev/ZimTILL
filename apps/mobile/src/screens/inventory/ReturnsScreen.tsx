import React from "react";
import { StockAdjustmentScreen } from "./StockAdjustmentScreen";

export function ReturnsScreen() {
  return (
    <StockAdjustmentScreen
      reason="RETURN"
      title="Returns"
      subtitle="Add customer returns back into stock and keep an audit trail even while offline."
      ctaLabel="Add return"
    />
  );
}
