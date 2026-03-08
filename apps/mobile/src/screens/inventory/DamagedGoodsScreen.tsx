import React from "react";
import { StockAdjustmentScreen } from "./StockAdjustmentScreen";

export function DamagedGoodsScreen() {
  return (
    <StockAdjustmentScreen
      reason="DAMAGED"
      title="Damaged Goods"
      subtitle="Record damaged stock losses offline so inventory stays accurate on every device."
      ctaLabel="Add damaged item"
    />
  );
}
