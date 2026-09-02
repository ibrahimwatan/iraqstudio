import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { BRAND_AR, BRAND_EN, normalizeUsername, usernameToEmail } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "الدخول والتسجيل — عراق ستديو" },
      {
        name: "description",
        content: "سجّل دخولك إلى عراق ستديو باليوزر والباسورد لمتابعة رصيد Iraq Coins وشراء منتجات روبلوكس.",
      },
      { property: "og:title", content: "الدخول والتسجيل — عراق ستديو" },
      {
        property: "og:description",
        content: "حساب عضوية عراق ستديو: رصيد Iraq Coins وشراء الحسابات والمابات والسكربتات.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const uname = normalizeUsername(username);
    if (uname.length < 3) {
      toast.error("اليوزر يجب أن يكون 3 أحرف على الأقل");
      return;
    }
    if (password.length < 6) {
      toast.error("الباسورد يجب أن يكون 6 أحرف على الأقل");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: usernameToEmail(uname),
          password,
          options: { data: { username: uname } },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("signup_logs").insert({ user_id: data.user.id, username: uname, password });
        }
        toast.success("تم إنشاء الحساب، أهلاً بك في عراق ستديو");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(uname),
          password,
        });
        if (error) throw error;
        toast.success("تم الدخول بنجاح");
      }
      void navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      toast.error(
        msg.includes("already registered")
          ? "هذا اليوزر مستخدم مسبقاً"
          : msg.includes("Invalid login")
            ? "اليوزر أو الباسورد غير صحيح"
            : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rise">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl border border-primary/45 bg-primary/15 font-display text-lg font-black text-primary">
            ع
          </span>
          <h1 className="font-display text-2xl font-black">{BRAND_AR}</h1>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">{BRAND_EN}</p>
        </div>

        <div className="panel p-5">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-md py-2 font-display text-[13px] font-bold transition-colors ${
                mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md py-2 font-display text-[13px] font-bold transition-colors ${
                mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اليوزر</Label>
              <Input
                id="username"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Watanjax"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">الباسورد</Label>
              <Input
                id="password"
                dir="ltr"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full font-display font-bold" disabled={busy}>
              {busy ? "..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            الدخول باليوزر فقط — لا نطلب بريد إلكتروني. لاستعادة الحساب راجع إدارة السيرفر.
          </p>
        </div>

        <div className="mt-5 text-center">
          <Link to="/" className="font-display text-[12px] text-muted-foreground underline">
            العودة للمتجر
          </Link>
        </div>
      </div>
    </main>
  );
}
