import React from "react";
import { StockAdjustmentScreen } from "./StockAdjustmentScreen";

export function ExpiredGoodsScreen() {
  return (
    <StockAdjustmentScreen
      reason="EXPIRED"
      title="Expired Goods"
      subtitle="Write off expired stock immediately, then sync it later when the device is online."
      ctaLabel="Add expired item"
    />
  );
}
