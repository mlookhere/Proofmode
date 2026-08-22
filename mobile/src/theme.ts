export const colors = {
  bg: "#090a0c",
  panel: "#111318",
  panel2: "#171a20",
  text: "#f8fafc",
  muted: "#9da4b0",
  line: "#272b33",
  hot: "#d7ff3f",
  danger: "#ff6a77",
  blue: "#84a8ff",
  orange: "#ffb55e",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 9,
  md: 17,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  eyebrow: {
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 1.3,
  },
  label: {
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 1,
  },
} as const;
