export function formatMoney(value: number, symbol = "$"): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatOrderStatus(value: string): string {
  return value.replace(/_/g, " ");
}

export function toStatusClass(value: string): string {
  return `status-${value.toLowerCase().replace(/_/g, "-")}`;
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
