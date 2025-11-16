export const colors = {
  bg: "#f3e8ff",
  offWhite: "#fbf5ff",
  gradientOverlay: "#f6efff",
  headerText: "#8b5fbf",
  subtitle: "#e38fbf",
  logoutBg: "#f8bef8",
  sectionShadow: "#e9d5ff",
  buttonPink: "#f5b3d4",
  primary: "#b88bb8",
  primaryDark: "#6b2c91",
  accent: "#d8a8d8",
  track: "#e8d4f0",
  negative: "#e38fbf",
  lightBorder: "#e8d4f0",
  cardBg: "#fbf3ff",
  textMuted: "#999",
  textDark: "#333",
};

export const shadow = (color) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 5,
});

export default { colors, shadow };
