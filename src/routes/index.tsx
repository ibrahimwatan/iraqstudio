import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, LifeBuoy, MessageCircle, Package, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  BRAND_AR,
  BRAND_EN,
  CATEGORIES,
  DISCORD_URL,
  PRODUCT_FILES_BUCKET,
  PRODUCT_IMAGES_BUCKET,
  MAX_PRODUCT_IMAGES,
  categoryLabel,
  formatCoins,
} from "@/lib/store";

import { Button } from "@/components/ui/button";
import { PurchaseChat } from "@/components/PurchaseChat";
import heroImg from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "عراق ستديو — متجر روبلوكس بعملة Iraq Coins" },
      {
        name: "description",
        content:
          "متجر عراق ستديو: حسابات روبلوكس، مابات جاهزة، سكربتات، وتصاميم ستيديو لايت — شراء فوري بعملة Iraq Coins.",
      },
      { property: "og:title", content: "عراق ستديو — متجر روبلوكس بعملة Iraq Coins" },
      {
        property: "og:description",
        content: "حسابات ومابات وسكربتات وخدمات روبلوكس داخل متجر واحد بعملة Iraq Coins.",
      },
    ],
  }),
  component: Storefront,
});

type Product = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  image_url: string | null;
  images: string[];
  imageUrls: string[];
};

function Storefront() {
  const { user, profile, refresh } = useAuth();
  const qc = useQueryClient();
  const [cat, setCat] = useState<string>("all");
  const [delivery, setDelivery] = useState<{
    title: string;
    text: string | null;
    downloadUrl: string | null;
    paidPrice: number;
    purchase: {
      id: string;
      user_id: string;
      merchant_id: string | null;
      chat_opened_at: string | null;
      chat_expires_at: string | null;
    };
  } | null>(null);


  const products = useQuery({
    queryKey: ["products"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, description, category, price, stock, image_url, images")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data as Array<Omit<Product, "imageUrls">>;
      return Promise.all(
        rows.map(async (product) => {
          const signed = product.images?.length
            ? await supabase.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(product.images, 60 * 60)
            : { data: [] };
          const imageUrls = (signed.data ?? [])
            .map((item) => item.signedUrl)
            .filter((url): url is string => Boolean(url));
          return {
            ...product,
            imageUrls: imageUrls.length > 0 ? imageUrls : product.image_url ? [product.image_url] : [],
          };
        }),
      );
    },
  });

  const buy = useMutation({
    mutationFn: async ({ product }: { product: Product }) => {
      const { data: row, error } = await supabase.rpc("buy_product", {
        _product_id: product.id,
      });
      if (error) throw error;
      let downloadUrl: string | null = null;
      if (row?.delivery_file) {
        const signed = await supabase.storage
          .from(PRODUCT_FILES_BUCKET)
          .createSignedUrl(row.delivery_file, 60 * 60);
        downloadUrl = signed.data?.signedUrl ?? null;
      }
      return {
        text: row?.delivery_text ?? null,
        downloadUrl,
        paidPrice: row?.price ?? product.price,
        purchase: {
          id: row.id,
          user_id: row.user_id,
          merchant_id: row.merchant_id,
          chat_opened_at: row.chat_opened_at,
          chat_expires_at: row.chat_expires_at,
        },
      };
    },
    onSuccess: (d, vars) => {
      toast.success("تم شراء " + vars.product.title + " بنجاح");
      setDelivery({
        title: vars.product.title,
        text: d.text,
        downloadUrl: d.downloadUrl,
        paidPrice: d.paidPrice,
        purchase: d.purchase,
      });
      void refresh();
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => {
      const error = e as { message?: unknown } | null;
      const msg = e instanceof Error
        ? e.message
        : error && typeof error.message === "string"
          ? error.message
          : String(e);
      toast.error(
        msg.includes("not_enough_coins") || msg.includes("insufficient_coins")
          ? "رصيد Iraq Coins غير كافي"
          : msg.includes("out_of_stock")
            ? "الكمية غير متوفرة حالياً"
            : msg.includes("banned")
              ? "حسابك محظور من الشراء"
              : msg,
      );
    },
  });

  const list = (products.data ?? []).filter((p) => cat === "all" || p.category === cat);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <section className="relative mt-4 overflow-hidden rounded-2xl border border-border rise">
        <img src={heroImg} alt="متجر عراق ستديو لخدمات روبلوكس" className="h-52 w-full object-cover sm:h-64" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-0 flex flex-col justify-end gap-3 p-5">
          <h1 className="font-display text-2xl font-black leading-tight sm:text-3xl">
            {BRAND_AR} <span className="text-primary">🇮🇶</span>
          </h1>
          <p className="max-w-lg text-[13px] text-muted-foreground">
            حسابات روبلوكس، مابات جاهزة، سكربتات، تصاميم ستيديو لايت وخدمات رقمية متنوعة — كلها بعملة{" "}
            <span className="text-coin-soft">Iraq Coins</span>.
          </p>
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{BRAND_EN}</p>
        </div>
      </section>

      <section className="mt-4 grid gap-2 sm:grid-cols-3">
        <DiscordAction icon={<LifeBuoy className="size-4" />} label="فتح تكت" hint="دعم فني عبر الديسكورد" />
        <DiscordAction icon={<Wallet className="size-4" />} label="تعبئة عملات" hint="شحن Iraq Coins" />
        <DiscordAction icon={<MessageCircle className="size-4" />} label="سيرفر الديسكورد" hint="مجتمع المتجر" />
      </section>

      {delivery && (
        <section className="panel mt-4 p-5 rise">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[14px] font-bold">تسليم: {delivery.title}</p>
            <Button variant="ghost" size="sm" onClick={() => setDelivery(null)}>
              إغلاق
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>المدفوع: {formatCoins(delivery.paidPrice)} عملة</span>
          </div>
          {delivery.text && (
            <pre
              dir="ltr"
              className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-elevated p-3 font-mono text-[12px] whitespace-pre-wrap"
            >
              {delivery.text}
            </pre>
          )}
          {delivery.downloadUrl && (
            <Button asChild className="mt-3 font-display font-bold">
              <a href={delivery.downloadUrl} target="_blank" rel="noreferrer" download>
                تحميل الملف
              </a>
            </Button>
          )}
          <Button asChild variant="outline" className="mt-3 me-2 font-display font-bold">
            <Link to="/orders">عرض سجل الشراء والشات</Link>
          </Button>
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 font-display text-[13px] font-bold">شات الطلب</p>
            {delivery.purchase ? (
              <PurchaseChat purchase={delivery.purchase} />
            ) : (
              <p className="text-[12px] text-muted-foreground">تم تسجيل الطلب. افتح سجل الشراء لبدء المحادثة.</p>
            )}
          </div>
          {!delivery.text && !delivery.downloadUrl && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              تواصل معنا في الديسكورد لإكمال التسليم.
            </p>
          )}
        </section>
      )}

      <section className="mt-8">

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`rounded-full border px-3.5 py-1.5 font-display text-[12px] font-bold transition-colors ${
                cat === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {!user ? (
          <div className="panel mt-5 p-6 text-center">
            <p className="font-display text-sm font-bold">المنتجات تظهر للأعضاء فقط</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              سجّل الدخول أو أنشئ حساباً باليوزر لمشاهدة المنتجات والشراء.
            </p>
            <Button asChild className="mt-4">
              <Link to="/auth">دخول / تسجيل</Link>
            </Button>
          </div>
        ) : products.isLoading ? (
          <p className="mt-5 text-[12px] text-muted-foreground">جاري تحميل المنتجات...</p>
        ) : list.length === 0 ? (
          <div className="panel mt-5 p-6 text-center">
            <Package className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 font-display text-sm font-bold">لا توجد منتجات في هذا القسم</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <article key={p.id} className="panel flex flex-col overflow-hidden rise">
                {p.imageUrls[0] ? (
                  <img src={p.imageUrls[0]} alt={p.title} className="h-36 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-36 w-full place-items-center bg-elevated">
                    <Package className="size-6 text-muted-foreground" />
                  </div>
                )}
                {p.imageUrls.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto border-t border-border bg-elevated p-2">
                    {p.imageUrls.slice(1, MAX_PRODUCT_IMAGES).map((imageUrl) => (
                      <img key={imageUrl} src={imageUrl} alt="" className="size-10 shrink-0 rounded object-cover" loading="lazy" />
                    ))}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="w-fit rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {categoryLabel(p.category)}
                  </span>
                  <h2 className="font-display text-[15px] font-bold leading-snug">{p.title}</h2>
                  {p.description && (
                    <p className="line-clamp-3 text-[12px] text-muted-foreground">{p.description}</p>
                  )}



                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-coin-soft">
                      <Coins className="size-3.5 text-coin" />
                      {formatCoins(p.price)}
                    </span>
                    <Button
                      size="sm"
                      disabled={p.stock <= 0 || buy.isPending}
                      onClick={() => buy.mutate({ product: p })}
                      className="font-display font-bold"
                    >
                      {p.stock <= 0 ? "نفدت الكمية" : "شراء"}
                    </Button>
                  </div>
                  {profile && profile.coins < p.price && p.stock > 0 && (
                    <p className="text-[11px] text-destructive">رصيدك لا يكفي — عبّي عملات من الديسكورد</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-border pt-6 text-center">
        <p className="font-display text-[13px] font-bold">{BRAND_AR}</p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{BRAND_EN}</p>
      </footer>
    </main>
  );
}

function DiscordAction({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <a
      href={DISCORD_URL}
      target="_blank"
      rel="noreferrer"
      className="panel flex items-center gap-3 p-4 transition-colors hover:border-primary/50"
    >
      <span className="grid size-9 place-items-center rounded-lg border border-border bg-elevated text-primary">
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[13px] font-bold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </a>
  );
}
