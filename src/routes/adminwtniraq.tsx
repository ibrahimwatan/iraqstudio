import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Coins, Download, Package, Receipt, Store, Tag, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createLocalDiscountCode, deleteLocalDiscountCode, listLocalDiscountCodes } from "@/lib/discount.functions";
import { useAuth } from "@/lib/useAuth";
import { MAX_PRODUCT_IMAGES, PRODUCT_FILES_BUCKET, PRODUCT_IMAGES_BUCKET, categoryLabel, formatCoins } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export const Route = createFileRoute("/adminwtniraq")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — عراق ستديو" },
      { name: "description", content: "لوحة إدارة عراق ستديو: حظر الأعضاء، شحن Iraq Coins، وعرض المنتجات." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "لوحة الإدارة — عراق ستديو" },
      { property: "og:description", content: "إدارة أعضاء ومنتجات متجر عراق ستديو." },
    ],
  }),
  component: AdminPage,
});


type AdminProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
  created_at: string;
  created_by: string | null;
  image_url: string | null;
  images: string[];
  imageUrls: string[];
  delivery_text: string | null;
  delivery_file: string | null;
  merchant_username: string | null;
};

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();

  if (loading) {
    return <CenterNote text="جاري التحقق..." />;
  }
  if (!user) {
    return (
      <CenterNote text="هذه الصفحة للإدارة فقط. سجّل الدخول أولاً." action={{ to: "/auth", label: "تسجيل الدخول" }} />
    );
  }
  if (!isAdmin) {
    return <CenterNote text="ليس لديك صلاحية الوصول لهذه اللوحة." action={{ to: "/", label: "العودة للمتجر" }} />;
  }
  return <AdminPanel />;
}

function CenterNote({
  text,
  action,
}: {
  text: string;
  action?: { to: "/" | "/auth"; label: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-sm p-6 text-center">
        <p className="font-display text-sm font-bold">{text}</p>
        {action && (
          <Button asChild className="mt-4">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        )}
      </div>
    </main>
  );
}

function AdminPanel() {
  const qc = useQueryClient();
  const { refresh } = useAuth();

  const [banUser, setBanUser] = useState("");
  const [coinUser, setCoinUser] = useState("");
  const [coinAmount, setCoinAmount] = useState("100");
  const [merchantUser, setMerchantUser] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("10");


  const discountCodes = useQuery({
    queryKey: ["admin-discount-codes"],
    queryFn: () => listLocalDiscountCodes(),
  });



  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const full = await supabase
        .from("products")
        .select("id, title, description, category, price, stock, active, created_at, created_by, image_url, images, delivery_text, delivery_file")
        .order("created_at", { ascending: false });

      let rows: Array<Omit<AdminProduct, "imageUrls" | "merchant_username">>;
      if (!full.error) {
        rows = full.data as Array<Omit<AdminProduct, "imageUrls" | "merchant_username">>;
      } else {
        const legacy = await supabase
          .from("products")
          .select("id, title, description, category, price, stock, active, created_at, created_by, image_url")
          .order("created_at", { ascending: false });
        if (legacy.error) throw new Error("تعذر تحميل المنتجات: " + full.error.message);
        rows = (legacy.data ?? []).map((product) => ({
          ...product,
          images: [],
          delivery_text: null,
          delivery_file: null,
        })) as Array<Omit<AdminProduct, "imageUrls" | "merchant_username">>;
      }

      const merchantIds = [...new Set(rows.map((product) => product.created_by).filter((id): id is string => Boolean(id)))];
      const profileResult = merchantIds.length
        ? await supabase.from("profiles").select("id, username").in("id", merchantIds)
        : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      const usernames = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.username]));

      return Promise.all(
        rows.map(async (product) => {
          const imagePaths = product.images ?? [];
          const signed = imagePaths.length
            ? await supabase.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(imagePaths, 60 * 60)
            : { data: [] };
          const imageUrls = (signed.data ?? [])
            .map((image) => image.signedUrl)
            .filter((url): url is string => Boolean(url));
          return {
            ...product,
            imageUrls: imageUrls.length > 0 ? imageUrls : product.image_url ? [product.image_url] : [],
            merchant_username: product.created_by ? usernames.get(product.created_by) ?? null : null,
          } satisfies AdminProduct;
        }),
      );
    },
  });

  const ban = useMutation({
    mutationFn: async ({ username, banned }: { username: string; banned: boolean }) => {
      const { error } = await supabase.rpc("admin_set_ban", { _username: username, _banned: banned });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.banned ? `تم حظر ${vars.username}` : `تم إلغاء حظر ${vars.username}`);
      setBanUser("");
    },
    onError: (e) => toast.error(readError(e)),
  });

  const addCoins = useMutation({
    mutationFn: async ({ username, amount }: { username: string; amount: number }) => {
      const { error } = await supabase.rpc("admin_add_coins", { _username: username, _amount: amount });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`تم شحن ${formatCoins(vars.amount)} عملة إلى ${vars.username}`);
      setCoinUser("");
      void refresh();
    },
    onError: (e) => toast.error(readError(e)),
  });

  const setMerchant = useMutation({
    mutationFn: async ({ username, grant }: { username: string; grant: boolean }) => {
      const { error } = await supabase.rpc("admin_set_role", {
        _username: username,
        _role: "merchant",
        _grant: grant,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.grant ? `تم تعيين ${vars.username} تاجراً` : `تم سحب صفة التاجر من ${vars.username}`);
      setMerchantUser("");
    },
    onError: (e) => toast.error(readError(e)),
  });


  const addDiscountCode = useMutation({
    mutationFn: () => createLocalDiscountCode({
      data: {
        code: discountCode,
        discountPercent: Number(discountPercent),
      },
    }),
    onSuccess: () => {
      toast.success("تمت إضافة كود الخصم");
      setDiscountCode("");
      void qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const removeDiscountCode = useMutation({
    mutationFn: (id: string) => deleteLocalDiscountCode({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف كود الخصم");
      void qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
    },
    onError: (e) => toast.error(readError(e)),
  });



  const removeProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المنتج");
      void qc.invalidateQueries({ queryKey: ["admin-products"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black">لوحة الإدارة</h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">/adminwtniraq</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">المتجر</Link>
        </Button>
      </div>

      <div className="space-y-5">
        <section className="panel p-5 rise">
          <SectionTitle icon={<Ban className="size-4 text-primary" />} title="حظر شخص" hint="عبر يوزره في الموقع" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              dir="ltr"
              value={banUser}
              onChange={(e) => setBanUser(e.target.value)}
              placeholder="username"
              className="min-w-40 flex-1"
            />
            <Button
              variant="destructive"
              disabled={!banUser.trim() || ban.isPending}
              onClick={() => ban.mutate({ username: banUser, banned: true })}
            >
              حظر
            </Button>
            <Button
              variant="outline"
              disabled={!banUser.trim() || ban.isPending}
              onClick={() => ban.mutate({ username: banUser, banned: false })}
            >
              إلغاء الحظر
            </Button>
          </div>
        </section>

        <section className="panel p-5 rise">
          <SectionTitle
            icon={<Coins className="size-4 text-coin" />}
            title="شحن عملات"
            hint="إضافة Iraq Coins ليوزر معيّن"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              dir="ltr"
              value={coinUser}
              onChange={(e) => setCoinUser(e.target.value)}
              placeholder="username"
              className="min-w-40 flex-1"
            />
            <Input
              dir="ltr"
              type="number"
              value={coinAmount}
              onChange={(e) => setCoinAmount(e.target.value)}
              className="w-28"
            />
            <Button
              disabled={!coinUser.trim() || addCoins.isPending}
              onClick={() => addCoins.mutate({ username: coinUser, amount: Number(coinAmount) || 0 })}
            >
              شحن
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            استخدم رقماً سالباً لخصم العملات من العضو.
          </p>
        </section>

        <section className="panel p-5 rise">
          <SectionTitle
            icon={<Store className="size-4 text-primary" />}
            title="تعيين تاجر"
            hint="اكتب يوزر الشخص لمنحه صفة تاجر"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              dir="ltr"
              value={merchantUser}
              onChange={(e) => setMerchantUser(e.target.value)}
              placeholder="username"
              className="min-w-40 flex-1"
            />
            <Button
              disabled={!merchantUser.trim() || setMerchant.isPending}
              onClick={() => setMerchant.mutate({ username: merchantUser, grant: true })}
            >
              تعيين تاجر
            </Button>
            <Button
              variant="outline"
              disabled={!merchantUser.trim() || setMerchant.isPending}
              onClick={() => setMerchant.mutate({ username: merchantUser, grant: false })}
            >
              سحب الصفة
            </Button>
          </div>
        </section>

        <section className="panel p-5 rise">
          <SectionTitle
            icon={<Tag className="size-4 text-primary" />}
            title="أكواد الخصم"
            hint="تطبق على جميع المنتجات"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              dir="ltr"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              placeholder="FAMOUS10"
              maxLength={32}
              className="min-w-40 flex-1 font-mono uppercase"
            />
            <Input
              dir="ltr"
              type="number"
              min={1}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="w-28"
              aria-label="نسبة الخصم"
            />
            <span className="self-center text-[12px] text-muted-foreground">%</span>
            <Button
              disabled={!discountCode.trim() || addDiscountCode.isPending}
              onClick={() => addDiscountCode.mutate()}
            >
              إضافة كود
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">مثال: FAMOUS10 يعطي خصم 10% على أي منتج.</p>
          <div className="mt-4 space-y-2">
            {discountCodes.isLoading && <p className="text-[12px] text-muted-foreground">جاري تحميل الأكواد...</p>}
            {discountCodes.isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive">
                {readError(discountCodes.error)}
              </div>
            )}
            {discountCodes.data?.length === 0 && (
              <p className="text-[12px] text-muted-foreground">لا توجد أكواد خصم حالياً.</p>
            )}
            {discountCodes.data?.map((discount) => (
              <div key={discount.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5">
                <div>
                  <p dir="ltr" className="font-mono text-[13px] font-bold">{discount.code}</p>
                  <p className="text-[11px] text-muted-foreground">خصم {discount.discount_percent}% · {new Date(discount.created_at).toLocaleDateString("ar-IQ")}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف كود الخصم"
                  disabled={removeDiscountCode.isPending}
                  onClick={() => removeDiscountCode.mutate(discount.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5 rise">
          <SectionTitle
            icon={<Package className="size-4 text-muted-foreground" />}
            title="المنتجات المعروضة"
            hint="للمراجعة والحذف فقط — الإضافة من لوحة التاجر"
          />

          <div className="mt-4 space-y-3">
            {products.isLoading && <p className="text-[12px] text-muted-foreground">جاري التحميل...</p>}
            {products.data?.length === 0 && (
              <p className="text-[12px] text-muted-foreground">لا توجد منتجات بعد.</p>
            )}
            {products.data?.map((product) => (
              <AdminProductCard
                key={product.id}
                product={product}
                onDelete={() => removeProduct.mutate(product.id)}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-elevated p-3">
            <p className="text-[12px] text-muted-foreground">لمراجعة تفاصيل المشتريات والشات مع المشترين:</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/orders"><Receipt className="me-1.5 size-4" /> سجل الشراء</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}


function AdminProductCard({ product, onDelete }: { product: AdminProduct; onDelete: () => void }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  async function openDeliveryFile() {
    if (!product.delivery_file) return;
    const signed = await supabase.storage.from(PRODUCT_FILES_BUCKET).createSignedUrl(product.delivery_file, 3600);
    setFileUrl(signed.data?.signedUrl ?? null);
    if (signed.data?.signedUrl) window.open(signed.data.signedUrl, "_blank");
  }

  return (
    <article className="rounded-lg border border-border bg-elevated p-4">
      {product.imageUrls.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {product.imageUrls.slice(0, MAX_PRODUCT_IMAGES).map((imageUrl) => (
            <img key={imageUrl} src={imageUrl} alt="" className="size-20 shrink-0 rounded-lg object-cover" loading="lazy" />
          ))}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[14px] font-bold">{product.title}</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {product.active ? "نشط" : "متوقف"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {categoryLabel(product.category)} · {formatCoins(product.price)} عملة · المخزون {product.stock}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="حذف المنتج" onClick={onDelete}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-border bg-card p-3 text-[11px] sm:grid-cols-2">
        <p><span className="text-muted-foreground">التاجر:</span> {product.merchant_username ?? "غير معروف"}</p>
        <p dir="ltr"><span className="text-muted-foreground">تاريخ الإضافة:</span> {new Date(product.created_at).toLocaleString("ar-IQ")}</p>
        <p dir="ltr" className="sm:col-span-2"><span className="text-muted-foreground">معرّف المنتج:</span> {product.id}</p>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[12px] text-muted-foreground">
        {product.description || "لا يوجد وصف"}
      </p>

      {product.delivery_text && (
        <pre dir="ltr" className="mt-3 max-h-36 overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-[11px] whitespace-pre-wrap">
          {product.delivery_text}
        </pre>
      )}
      {product.delivery_file && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void openDeliveryFile()}>
            <Download className="me-1.5 size-4" /> {fileUrl ? "فتح الملف مرة أخرى" : "فتح ملف التسليم"}
          </Button>
          <span dir="ltr" className="max-w-full truncate text-[10px] text-muted-foreground">{product.delivery_file}</span>
        </div>
      )}
    </article>
  );
}

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-lg border border-border bg-elevated">{icon}</span>
      <span className="leading-tight">
        <span className="block font-display text-[14px] font-bold">{title}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

function readError(e: unknown) {
  const error = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null;
  const rawMessage = e instanceof Error
    ? e.message
    : error && typeof error.message === "string"
      ? error.message
      : typeof e === "string"
        ? e
        : "حدث خطأ غير معروف";
  const code = typeof error?.code === "string" ? error.code : "";
  const msg = rawMessage.toLowerCase();
  if (msg.includes("local_discount_storage")) return "تعذر الوصول إلى قاعدة أكواد الخصم المحلية";
  if (msg.includes("invalid_discount_code_format")) return "اكتب كوداً من 3 إلى 32 حرفاً أو رقماً";
  if (msg.includes("invalid_discount_percent")) return "نسبة الخصم يجب أن تكون بين 1 و100";
  if (msg.includes("discount_code_exists")) return "هذا الكود موجود مسبقاً";
  if (msg.includes("discount_code_not_found")) return "كود الخصم غير موجود";
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("already exists")) return "هذا الكود موجود مسبقاً";
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) return "ليس لديك صلاحية لتنفيذ هذه العملية";
  if (msg.includes("user_not_found")) return "لا يوجد عضو بهذا اليوزر";
  if (msg.includes("not_admin")) return "لا تملك صلاحية الإدارة";
  return rawMessage;
}
