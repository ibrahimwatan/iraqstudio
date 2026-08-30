export const DISCORD_URL = "https://discord.gg/9rbAZMDFPP";

export const BRAND_AR = "عـراق سـتديـو";
export const BRAND_EN = "IRAQ STUDIO";

export const CATEGORIES = [
  { key: "all", label: "الكل" },
  { key: "accounts", label: "حسابات" },
  { key: "maps", label: "مابات" },
  { key: "scripts", label: "سكربتات" },
  { key: "studio", label: "ستيديو لايت" },
  { key: "other", label: "خدمات أخرى" },
] as const;

export const PRODUCT_CATEGORIES = CATEGORIES.filter((c) => c.key !== "all");

export function categoryLabel(key: string) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? "خدمات أخرى";
}

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/** Auth requires an email; the site itself is username-only. */
export function usernameToEmail(raw: string) {
  return `${normalizeUsername(raw)}@iraqstudio.app`;
}

export function formatCoins(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}
