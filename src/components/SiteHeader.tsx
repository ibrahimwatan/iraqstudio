import { Link } from "@tanstack/react-router";
import { Copy, LogOut, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { BRAND_AR, BRAND_EN, formatCoins } from "@/lib/store";
import { Button } from "@/components/ui/button";


export function SiteHeader() {
  const { profile, isAdmin, isMerchant, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flag-rule h-[3px] w-full" />
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/45 bg-primary/15 font-display text-sm font-black text-primary">
            ع
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[15px] font-black">{BRAND_AR}</span>
            <span className="block truncate font-mono text-[9px] tracking-[0.22em] text-muted-foreground">
              {BRAND_EN}
            </span>
          </span>
        </Link>

        <div className="ms-auto flex items-center gap-2">
          {profile ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(profile.username);
                  toast.success("تم نسخ اسم المستخدم: " + profile.username);
                }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/50"
                aria-label="نسخ اسم المستخدم"
              >
                <Copy className="size-3 text-muted-foreground" />
                <span className="max-w-[110px] truncate font-mono text-[12px] font-semibold">
                  {profile.username}
                </span>
              </button>
              <span className="flex items-center gap-1.5 rounded-full border border-coin/35 bg-card px-3 py-1.5">
                <span className="coin-dot size-2.5 rounded-full bg-coin" />
                <span className="font-mono text-[12px] font-semibold text-coin-soft">
                  {formatCoins(profile.coins)}
                </span>
                <span className="text-[10px] text-muted-foreground">عملة</span>
              </span>

              {isMerchant && (
                <Button asChild variant="outline" size="icon" aria-label="لوحة التاجر">
                  <Link to="/merchant">
                    <Store className="size-4" />
                  </Link>
                </Button>
              )}

              {isAdmin && (
                <Button asChild variant="outline" size="icon" aria-label="لوحة الإدارة">
                  <Link to="/adminwtniraq">
                    <ShieldCheck className="size-4" />
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="خروج" onClick={() => void signOut()}>
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">دخول / تسجيل</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
