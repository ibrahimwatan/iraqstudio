import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = { supabase: any; userId: string };

type DiscountCode = {
  id: string;
  code: string;
  discount_percent: number;
  active: boolean;
  created_at: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function validateCode(code: string) {
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("invalid_discount_code_format");
}

function validatePercent(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new Error("invalid_discount_percent");
  }
}

async function assertAdmin(context: unknown) {
  const { supabase, userId } = context as AuthContext;
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  if (!data?.some((role: { role: string }) => role.role === "admin")) throw new Error("not_admin");
  return { supabase, userId };
}

export const listLocalDiscountCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await assertAdmin(context);
    const { data, error } = await supabase
      .from("discount_codes")
      .select("id, code, discount_percent, active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DiscountCode[];
  });

export const createLocalDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code?: unknown; discountPercent?: unknown }) => ({
    code: typeof data?.code === "string" ? data.code : "",
    discountPercent: Number(data?.discountPercent),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await assertAdmin(context);
    const code = normalizeCode(data.code);
    validateCode(code);
    validatePercent(data.discountPercent);

    const { data: created, error } = await supabase
      .from("discount_codes")
      .insert({ code, discount_percent: data.discountPercent, created_by: userId, active: true })
      .select("id, code, discount_percent, active, created_at")
      .single();
    if (error) throw error;
    return created as DiscountCode;
  });

export const deleteLocalDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: unknown }) => ({ id: typeof data?.id === "string" ? data.id : "" }))
  .handler(async ({ data, context }) => {
    const { supabase } = await assertAdmin(context);
    if (!data.id) throw new Error("discount_code_not_found");
    const { error } = await supabase.from("discount_codes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const buyProductWithLocalDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { productId?: unknown; code?: unknown }) => ({
    productId: typeof data?.productId === "string" ? data.productId : "",
    code: typeof data?.code === "string" ? data.code : "",
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as AuthContext;
    if (!data.productId) throw new Error("product_not_found");

    const code = normalizeCode(data.code);
    if (code) validateCode(code);

    const { data: purchase, error } = await supabase.rpc("buy_product", {
      _product_id: data.productId,
      _discount_code: code || null,
    });
    if (error) throw error;
    return purchase;
  });
