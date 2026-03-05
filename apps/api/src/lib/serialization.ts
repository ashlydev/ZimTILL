function isDecimalLike(value: unknown): value is { toNumber: () => number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  );
}

export function toPlain<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item)) as T;
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(input)) {
      if (isDecimalLike(item)) {
        output[key] = item.toNumber();
      } else if (item instanceof Date) {
        output[key] = item.toISOString();
      } else if (Array.isArray(item) || (item && typeof item === "object")) {
        output[key] = toPlain(item);
      } else {
        output[key] = item;
      }
    }

    return output as T;
  }

  return value;
}
