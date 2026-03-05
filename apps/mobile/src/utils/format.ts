export function formatMoney(amount: number, symbol = "$") {
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString();
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleDateString();
}
