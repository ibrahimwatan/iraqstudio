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
  merchant_id: string | null;
  product_title: string;
  product_description: string | null;
  product_category: string | null;
  product_images: string[];
  product_image_urls: string[];
  price: number;
  created_at: string;
  chat_opened_at: string | null;
  chat_expires_at: string | null;
  delivery_text: string | null;
  delivery_file: string | null;
  buyer_username: string | null;
  merchant_username: string | null;
};

function OrdersPage() {
  const { user, loading, isAdmin } = useAuth();
  const [tab, setTab] = useState<"mine" | "sales">(() => (isAdmin ? "sales" : "mine"));

  const rows = useQuery({
    queryKey: ["purchases"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "id, user_id, merchant_id, product_title, product_description, product_category, product_images, price, created_at, chat_opened_at, chat_expires_at, delivery_text, delivery_file",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      const baseRows = data as Array<Omit<Purchase, "product_image_urls" | "buyer_username" | "merchant_username">>;
      const profileIds = [...new Set(baseRows.flatMap((purchase) => [purchase.user_id, purchase.merchant_id]).filter((id): id is string => Boolean(id)))];
      const profileResult = profileIds.length
        ? await supabase.from("profiles").select("id, username").in("id", profileIds)
        : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      const usernames = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.username]));

      return Promise.all(
        baseRows.map(async (purchase) => {
          const signed = purchase.product_images?.length
            ? await supabase.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(purchase.product_images, 60 * 60)
            : { data: [] };
          const product_image_urls = (signed.data ?? [])
            .map((image) => image.signedUrl)
            .filter((url): url is string => Boolean(url));
          return {
            ...purchase,
            product_image_urls,
            buyer_username: usernames.get(purchase.user_id) ?? null,
            merchant_username: purchase.merchant_id ? usernames.get(purchase.merchant_id) ?? null : null,
          } satisfies Purchase;
        }),
      );
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
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-coin-soft">
          <Coins className="size-3.5 text-coin" />
          {formatCoins(p.price)}
        </span>
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
