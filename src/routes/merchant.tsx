import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Package, Store, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/merchant")({
  head: () => ({
    meta: [
      { title: "لوحة التاجر — عراق ستديو" },
      {
        name: "description",
        content: "لوحة التاجر في عراق ستديو: عرض منتجاتك الخاصة وإدارة أسعارها وكمياتها.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "لوحة التاجر — عراق ستديو" },
      { property: "og:description", content: "إدارة منتجات التاجر داخل متجر عراق ستديو." },
    ],
  }),
  component: MerchantPage,
});

function MerchantPage() {
  const { user, isMerchant, loading } = useAuth();

  if (loading) return <CenterNote text="جاري التحقق..." />;
  if (!user)
    return <CenterNote text="سجّل الدخول للوصول إلى لوحة التاجر." action={{ to: "/auth", label: "تسجيل الدخول" }} />;
  if (!isMerchant)
    return (
      <CenterNote
        text="حسابك ليس تاجراً. تواصل مع الإدارة في الديسكورد لطلب صفة تاجر."
        action={{ to: "/", label: "العودة للمتجر" }}
      />
    );
  return <MerchantPanel />;
}

function CenterNote({
  text,
  action,
}: {
  text: string;
  action?: { to: "/" | "/auth"; label: string };
}) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
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

function MerchantPanel() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("accounts");
  const [price, setPrice] = useState("500");
  const [stock, setStock] = useState("1");
  const [imageUrl, setImageUrl] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mine = useQuery({
    queryKey: ["merchant-products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, category, price, stock, active, file_name")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["merchant-products"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
  }

  const addProduct = useMutation({
    mutationFn: async () => {
      let filePath: string | null = null;

      if (selectedFile) {
        if (selectedFile.size > 50 * 1024 * 1024) {
          throw new Error("حجم الملف يجب أن يكون أقل من 50 ميغابايت");
        }
        const safeName = selectedFile.name.replace(/[^\w.\-() ]/g, "_");
        filePath = user!.id + "/" + crypto.randomUUID() + "-" + safeName;
        const { error: uploadError } = await supabase.storage.from("product-files").upload(filePath, selectedFile, {
          upsert: false,
          contentType: selectedFile.type || "application/octet-stream",
        });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.from("products").insert({
        title: title.trim(),
        description: description.trim(),
        category,
        price: Number(price) || 0,
        stock: Number(stock) || 1,
        image_url: imageUrl.trim() || null,
        account_name: category === "accounts" ? accountName.trim() : null,
        account_username: category === "accounts" ? accountUsername.trim() : null,
        script_content: category === "scripts" ? scriptContent.trim() : null,
        file_path: filePath,
        file_name: filePath ? selectedFile?.name ?? null : null,
        created_by: user!.id,
      });
      if (error) {
        if (filePath) await supabase.storage.from("product-files").remove([filePath]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم عرض منتجك في المتجر");
      setTitle("");
      setDescription("");
      setImageUrl("");
      setAccountName("");
      setAccountUsername("");
      setScriptContent("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("products").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const removeProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المنتج");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black">لوحة التاجر</h1>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            {profile?.username ?? ""} · /merchant
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">المتجر</Link>
        </Button>
      </div>

      <div className="space-y-5">
        <section className="panel p-5 rise">
          <SectionTitle
            icon={<Store className="size-4 text-primary" />}
            title="عرض منتج جديد"
            hint="يظهر للأعضاء داخل المتجر مباشرة"
          />
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) {
                toast.error("اكتب اسم المنتج");
                return;
              }
              if (category === "accounts" && (!accountName.trim() || !accountUsername.trim())) {
                toast.error("اكتب اسم الحساب واليوزر للحسابات");
                return;
              }
              if (category === "scripts" && !scriptContent.trim()) {
                toast.error("أضف محتوى السكربت");
                return;
              }
              if ((category === "maps" || category === "studio") && !selectedFile) {
                toast.error("ارفع ملف المنتج لهذا القسم");
                return;
              }
              addProduct.mutate();
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="m-title">اسم المنتج</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="m-desc">الوصف</Label>
              <Textarea
                id="m-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>القسم</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {category === "accounts" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="m-account-name">اسم الحساب *</Label>
                  <Input
                    id="m-account-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="مثال: حساب روبلوكس مميز"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-account-username">يوزر الحساب *</Label>
                  <Input
                    id="m-account-username"
                    dir="ltr"
                    value={accountUsername}
                    onChange={(e) => setAccountUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
              </>
            )}
            {category === "scripts" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="m-script">السكربت *</Label>
                <Textarea
                  id="m-script"
                  rows={6}
                  dir="ltr"
                  value={scriptContent}
                  onChange={(e) => setScriptContent(e.target.value)}
                  placeholder="الصق محتوى السكربت هنا"
                />
              </div>
            )}
            {(category === "maps" || category === "studio") && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="m-file">ملف المنتج *</Label>
                <Input
                  ref={fileInputRef}
                  id="m-file"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-[11px] text-muted-foreground">مطلوب لهذا القسم — الحد الأقصى 50 ميغابايت.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="m-price">السعر بالعملات</Label>
              <Input id="m-price" dir="ltr" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-stock">الكمية</Label>
              <Input id="m-stock" dir="ltr" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-img">رابط الصورة (اختياري)</Label>
              <Input
                id="m-img"
                dir="ltr"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full font-display font-bold" disabled={addProduct.isPending}>
                عرض المنتج
              </Button>
            </div>
          </form>
        </section>

        <section className="panel p-5 rise">
          <SectionTitle icon={<Package className="size-4 text-success" />} title="منتجاتي" />
          <div className="mt-4 space-y-2">
            {mine.isLoading && <p className="text-[12px] text-muted-foreground">جاري التحميل...</p>}
            {mine.data?.length === 0 && <p className="text-[12px] text-muted-foreground">لم تعرض أي منتج بعد.</p>}
            {mine.data?.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[13px] font-bold">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {categoryLabel(p.category)} · {formatCoins(p.price)} عملة · متوفر {p.stock}
                    {!p.active && " · مخفي"}
                    {p.file_name && " · مرفق ملف"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={p.active ? "إخفاء" : "إظهار"}
                  onClick={() => toggleActive.mutate({ id: p.id, active: !p.active })}
                >
                  {p.active ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => removeProduct.mutate(p.id)}>
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
