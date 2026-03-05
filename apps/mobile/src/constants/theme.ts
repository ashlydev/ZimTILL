export const colors = {
  background: "#FFFFFF",
  backgroundAlt: "#F8FAFC",
  surface: "#F3F4F6",
  surfaceStrong: "#E5E7EB",
  navy: "#0B1F3B",
  navySoft: "#12325D",
  slate: "#6B7280",
  dark: "#111827",
  darkSoft: "#374151",
  border: "#D1D5DB",
  success: "#166534",
  warning: "#92400E",
  danger: "#991B1B"
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22
} as const;

export const shadows = {
  card: {
    shadowColor: "#0B1F3B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3
  }
} as const;
