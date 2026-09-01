import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Download, MessagesSquare, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { PRODUCT_FILES_BUCKET, PRODUCT_IMAGES_BUCKET, categoryLabel, formatCoins } from "@/lib/store";
import { PurchaseChat } from "@/components/PurchaseChat";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "سجل المعاملات — عراق ستديو" },
      {
        name: "description",
        content: "سجل عمليات الشراء الخاصة بك في عراق ستديو مع تفاصيل التسليم ومحادثة مع التاجر والإدارة.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "سجل المعاملات — عراق ستديو" },
      { property: "og:description", content: "تابع مشترياتك وتسليماتها ومحادثات الدعم." },
    ],
  }),
  component: OrdersPage,
});

type Purchase = {
  id: string;
  user_id: string;
  product_id: string | null;
  merchant_id: string | null;
  product_title: string;
  product_description: string | null;
  product_category: string | null;
  product_images: string[];
  product_image_urls: string[];
  price: number;
  original_price: number;
  discount_code: string | null;
  discount_percent: number;
  created_at: string;
  chat_opened_at: string | null;
  chat_expires_at: string | null;
  delivery_text: string | null;
  delivery_file: string | null;
  buyer_username: string | null;
  merchant_username: string | null;
};


type PurchaseRow = Omit<Purchase, "product_image_urls" | "buyer_username" | "merchant_username">;

type ProductFallback = {
  id: string;
  description: string;
  category: string;
  image_url: string | null;
};

async function decoratePurchases(rows: PurchaseRow[]): Promise<Purchase[]> {
  const profileIds = [...new Set(rows.flatMap((purchase) => [purchase.user_id, purchase.merchant_id]).filter((id): id is string => Boolean(id)))];
  const productIds = [...new Set(rows.map((purchase) => purchase.product_id).filter((id): id is string => Boolean(id)))];
  const [profileResult, productResult] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, username").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase.from("products").select("id, description, category, image_url").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  const usernames = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.username]));
  const productInfo = new Map((productResult.data ?? []).map((product) => [product.id, product as ProductFallback]));

  return Promise.all(
    rows.map(async (purchase) => {
      const fallback = purchase.product_id ? productInfo.get(purchase.product_id) : undefined;
      const imagePaths = purchase.product_images ?? [];
      const signed = imagePaths.length
        ? await supabase.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(imagePaths, 60 * 60)
        : { data: [] };
      const product_image_urls = (signed.data ?? [])
        .map((image) => image.signedUrl)
        .filter((url): url is string => Boolean(url));
      return {
        ...purchase,
        product_description: purchase.product_description ?? fallback?.description ?? null,
        product_category: purchase.product_category ?? fallback?.category ?? null,
        product_image_urls: product_image_urls.length > 0
          ? product_image_urls
          : fallback?.image_url
            ? [fallback.image_url]
            : [],
        buyer_username: usernames.get(purchase.user_id) ?? null,
        merchant_username: purchase.merchant_id ? usernames.get(purchase.merchant_id) ?? null : null,
      } satisfies Purchase;
    }),
  );
}

function OrdersPage() {
  const { user, loading, isAdmin } = useAuth();
  const [tab, setTab] = useState<"mine" | "sales">(() => (isAdmin ? "sales" : "mine"));

  const rows = useQuery({
    queryKey: ["purchases"],
    enabled: Boolean(user),
    queryFn: async () => {
      const full = await supabase
        .from("purchases")
        .select(
          "id, user_id, product_id, merchant_id, product_title, product_description, product_category, product_images, price, original_price, discount_code, discount_percent, created_at, chat_opened_at, chat_expires_at, delivery_text, delivery_file",
        )
        .order("created_at", { ascending: false });

      if (!full.error) {
        return decoratePurchases(full.data as PurchaseRow[]);
      }

      // Keep the history usable while a project is still on the older schema.
      const withDelivery = await supabase
        .from("purchases")
        .select("id, user_id, product_id, merchant_id, product_title, price, created_at, chat_expires_at, delivery_text, delivery_file")
        .order("created_at", { ascending: false });
      if (!withDelivery.error) {
        const rowsWithDelivery = (withDelivery.data ?? []).map((purchase) => ({
          ...purchase,
          product_description: null,
          product_category: null,
          product_images: [],
          product_image_urls: [],
          original_price: purchase.price,
          discount_code: null,
          discount_percent: 0,
          chat_opened_at: purchase.chat_expires_at ? purchase.created_at : null,
        })) as PurchaseRow[];
        return decoratePurchases(rowsWithDelivery);
      }

      const legacy = await supabase
        .from("purchases")
        .select("id, user_id, product_id, product_title, price, created_at")
        .order("created_at", { ascending: false });
      if (legacy.error) {
        throw new Error("تعذر تحميل سجل الشراء: " + full.error.message);
      }
      const legacyRows = (legacy.data ?? []).map((purchase) => ({
        ...purchase,
        merchant_id: null,
        product_description: null,
        product_category: null,
        product_images: [],
        product_image_urls: [],
        original_price: purchase.price,
        discount_code: null,
        discount_percent: 0,
        chat_opened_at: null,
        chat_expires_at: null,
        delivery_text: null,
        delivery_file: null,
      })) as PurchaseRow[];
      return decoratePurchases(legacyRows);
    },
  });

  if (loading) return <Note text="جاري التحقق..." />;
  if (!user) return <Note text="سجّل الدخول لمشاهدة سجل معاملاتك." withAuth />;

  const all = rows.data ?? [];
  const mine = all.filter((p) => p.user_id === user.id);
  const sales = all.filter((p) => p.user_id !== user.id);
  const list = tab === "mine" ? mine : sales;
  const salesLabel = isAdmin ? "كل المشتريات" : "مبيعاتي";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black">سجل المعاملات</h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">/orders</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">المتجر</Link>
        </Button>
      </div>

      {sales.length > 0 && (
        <div className="mb-4 flex gap-2">
          <TabBtn active={tab === "mine"} onClick={() => setTab("mine")} label={`مشترياتي (${mine.length})`} />
          <TabBtn active={tab === "sales"} onClick={() => setTab("sales")} label={`${salesLabel} (${sales.length})`} />
        </div>
      )}

      {rows.isLoading ? (
        <p className="text-[12px] text-muted-foreground">جاري التحميل...</p>
      ) : rows.isError ? (
        <div className="panel p-6 text-center">
          <Receipt className="mx-auto size-5 text-destructive" />
          <p className="mt-2 font-display text-sm font-bold">تعذر تحميل سجل الشراء</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{rows.error instanceof Error ? rows.error.message : "حاول مرة ثانية"}</p>
          <Button className="mt-3" size="sm" onClick={() => void rows.refetch()}>إعادة المحاولة</Button>
        </div>
      ) : list.length === 0 ? (
        <div className="panel p-6 text-center">
          <Receipt className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 font-display text-sm font-bold">لا توجد عمليات بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <OrderCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </main>
  );
}

function OrderCard({ p }: { p: Purchase }) {
  const [showChat, setShowChat] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function download() {
    if (!p.delivery_file) return;
    const signed = await supabase.storage.from(PRODUCT_FILES_BUCKET).createSignedUrl(p.delivery_file, 3600);
    setUrl(signed.data?.signedUrl ?? null);
    if (signed.data?.signedUrl) window.open(signed.data.signedUrl, "_blank");
  }

  return (
    <article className="panel p-4 rise">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[14px] font-bold">{p.product_title}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(p.created_at).toLocaleString("ar-IQ")}
          </p>
        </div>
        <div className="text-end">
          <span className="flex items-center justify-end gap-1.5 font-mono text-[13px] font-semibold text-coin-soft">
            <Coins className="size-3.5 text-coin" />
            {formatCoins(p.price)}
          </span>
          {p.discount_percent > 0 && (
            <p className="mt-1 text-[10px] text-success">
              خصم {p.discount_percent}% ({p.discount_code}) · قبل الخصم {formatCoins(p.original_price)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-border bg-elevated p-3 text-[11px] sm:grid-cols-2">
        <p><span className="text-muted-foreground">رقم الطلب:</span> <span dir="ltr">{p.id}</span></p>
        <p><span className="text-muted-foreground">القسم:</span> {p.product_category ? categoryLabel(p.product_category) : "غير محدد"}</p>
        <p><span className="text-muted-foreground">المشتري:</span> {p.buyer_username ?? "غير معروف"}</p>
        <p><span className="text-muted-foreground">التاجر:</span> {p.merchant_username ?? "غير معروف"}</p>
      </div>

      {p.product_image_urls.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {p.product_image_urls.map((imageUrl) => (
            <img key={imageUrl} src={imageUrl} alt="" className="size-20 shrink-0 rounded-lg object-cover" loading="lazy" />
          ))}
        </div>
      )}

      {p.product_description && (
        <p className="mt-3 whitespace-pre-wrap text-[12px] text-muted-foreground">{p.product_description}</p>
      )}

      {p.delivery_text && (
        <pre
          dir="ltr"
          className="mt-3 max-h-48 overflow-auto rounded-lg border border-border bg-elevated p-3 font-mono text-[12px] whitespace-pre-wrap"
        >
          {p.delivery_text}
        </pre>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {p.delivery_file && (
          <Button size="sm" variant="outline" onClick={() => void download()}>
            <Download className="me-1.5 size-4" />
            {url ? "تحميل مرة أخرى" : "تحميل الملف"}
          </Button>
        )}

        <p className="mt-2 w-full text-[11px] text-muted-foreground">
          الشات يظهر هنا داخل الطلب — افتح «محادثة الشراء» للتواصل مع المشتري أو التاجر أو الإدارة.
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowChat((v) => !v)}>
          <MessagesSquare className="me-1.5 size-4" />
          {showChat ? "إخفاء المحادثة" : "محادثة الشراء"}
        </Button>
      </div>

      {showChat && <PurchaseChat purchase={p} />}
    </article>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 font-display text-[12px] font-bold transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Note({ text, withAuth }: { text: string; withAuth?: boolean }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="panel max-w-sm p-6 text-center">
        <p className="font-display text-sm font-bold">{text}</p>
        {withAuth && (
          <Button asChild className="mt-4">
            <Link to="/auth">تسجيل الدخول</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
