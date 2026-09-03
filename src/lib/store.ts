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

export type DeliveryKind = "file" | "account" | "script" | "none";

/** ما الذي يجب على التاجر تقديمه حسب القسم */
export function deliveryKind(category: string): DeliveryKind {
  if (category === "maps" || category === "studio") return "file";
  if (category === "accounts") return "account";
  if (category === "scripts") return "script";
  return "none";
}

export const PRODUCT_FILES_BUCKET = "product-files";


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

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGES = 5;
export const CHAT_HOURS = 24;

/** روابط مؤقتة لصور المنتجات (الباكت خاص) */
export async function signImages(
  storage: {
    from: (b: string) => {
      createSignedUrls: (paths: string[], exp: number) => Promise<{ data: { signedUrl: string }[] | null }>;
    };
  },
  paths: string[],
) {
  if (paths.length === 0) return [];
  const res = await storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(paths, 60 * 60);
  return (res.data ?? []).map((r) => r.signedUrl);
}

export function timeLeftLabel(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} ساعة و${m} دقيقة` : `${m} دقيقة`;
}

/** تخصص التاجر: "all" = عام، أو مفتاح قسم واحد */
export const MERCHANT_SCOPES = [
  { key: "all", label: "تاجر عام" },
  { key: "accounts", label: "تاجر حسابات" },
  { key: "maps", label: "تاجر مابات" },
  { key: "scripts", label: "تاجر سكربتات" },
  { key: "studio", label: "تاجر ستيديو لايت" },
  { key: "other", label: "تاجر خدمات أخرى" },
] as const;

export function merchantScopeLabel(key: string) {
  return MERCHANT_SCOPES.find((s) => s.key === key)?.label ?? "تاجر عام";
}

/** الأقسام المسموح للتاجر بالعرض فيها حسب تخصصه */
export function allowedCategories(scope: string) {
  if (!scope || scope === "all") return PRODUCT_CATEGORIES.map((c) => c.key as string);
  return PRODUCT_CATEGORIES.filter((c) => c.key === scope).map((c) => c.key as string);
}
