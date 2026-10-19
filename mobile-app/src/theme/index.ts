/** Mobile design tokens: quiet paper surfaces, ink controls and a distinct high-contrast HUD. */
export const colors = {
  bg: "#F5F5F3",
  surface: "#FFFFFF",
  surfaceRaised: "#ECECEA",
  border: "#DEDEDA",
  text: "#1A1A18",
  textMuted: "#64645F",
  textFaint: "#666660",
  accent: "#20201E",
  accentDim: "#E8E8E4",
  onAccent: "#FFFFFF",
  brand: "#E5F42B",
  success: "#286444",
  successDim: "#E3EFE5",
  warning: "#805113",
  warningDim: "#F5EBD7",
  danger: "#AB3030",
  dangerStrong: "#B52828",
  dangerDim: "#F8E6E3",
  sos: "#B91C1C",
  hudGlow: "#E5F42B",
  onDark: "#F5F5F0",
  onDarkMuted: "#B9BCB2",
} as const;
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  section: 40,
} as const;
export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;
// Each weight is a bundled family so Android measures compact labels correctly.
export const fonts = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  extrabold: "DMSans_800ExtraBold",
} as const;
export type FontWeightName = keyof typeof fonts;
export const type = {
  display: { fontSize: 40, lineHeight: 46, letterSpacing: -1.8 },
  title: { fontSize: 30, lineHeight: 37, letterSpacing: -1 },
  heading: { fontSize: 21, lineHeight: 28, letterSpacing: -0.45 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
export type TypeVariant = keyof typeof type;
/** Large targets for parking/preparation; always use the helmet while riding. */
export const TOUCH_TARGET = 56;
