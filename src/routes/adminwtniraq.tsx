import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Coins, Package, Store, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { PRODUCT_CATEGORIES, categoryLabel, formatCoins } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("accounts");
  const [price, setPrice] = useState("500");
  const [stock, setStock] = useState("1");
  const [imageUrl, setImageUrl] = useState("");

  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, category, price, stock, active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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

  const addProduct = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        title: title.trim(),
        description: description.trim(),
        category,
        price: Number(price) || 0,
        stock: Number(stock) || 1,
        image_url: imageUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم عرض المنتج في المتجر");
      setTitle("");
      setDescription("");
      setImageUrl("");
      void qc.invalidateQueries({ queryKey: ["admin-products"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
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
            icon={<Package className="size-4 text-muted-foreground" />}
            title="المنتجات المعروضة"
            hint="للمراجعة والحذف فقط — الإضافة من لوحة التاجر"
          />

          <div className="mt-4 space-y-2">
            {products.isLoading && <p className="text-[12px] text-muted-foreground">جاري التحميل...</p>}
            {products.data?.length === 0 && (
              <p className="text-[12px] text-muted-foreground">لا توجد منتجات بعد.</p>
            )}
            {products.data?.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[13px] font-bold">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {categoryLabel(p.category)} · {formatCoins(p.price)} عملة · متوفر {p.stock}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  onClick={() => removeProduct.mutate(p.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
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
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("user_not_found")) return "لا يوجد عضو بهذا اليوزر";
  if (msg.includes("not_admin")) return "لا تملك صلاحية الإدارة";
  return msg;
}
