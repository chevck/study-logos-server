export const THEMES = ["light", "dark", "system"];

export function normalizeTheme(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "light" || value === "dark" || value === "system") return value;
  return null;
}

export function themeFromDoc(doc) {
  return normalizeTheme(doc?.theme) ?? "system";
}
