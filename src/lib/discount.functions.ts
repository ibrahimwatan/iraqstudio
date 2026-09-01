import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Discount codes intentionally use local server storage; Supabase is only used for the final purchase transaction.
type AuthContext = { supabase: any; userId: string };

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
    await assertAdmin(context);
    const { listCodes } = await import("@/lib/local-discount-store.server");
    return listCodes();
  });

export const createLocalDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code?: unknown; discountPercent?: unknown }) => ({
    code: typeof data?.code === "string" ? data.code : "",
    discountPercent: Number(data?.discountPercent),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { addCode } = await import("@/lib/local-discount-store.server");
    return addCode(data.code, data.discountPercent);
  });

export const deleteLocalDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: unknown }) => ({ id: typeof data?.id === "string" ? data.id : "" }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { removeCode } = await import("@/lib/local-discount-store.server");
    await removeCode(data.id);
    return { ok: true };
  });

export const buyProductWithLocalDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { productId?: unknown; code?: unknown }) => ({
    productId: typeof data?.productId === "string" ? data.productId : "",
    code: typeof data?.code === "string" ? data.code : "",
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context as AuthContext;
    const { findCode } = await import("@/lib/local-discount-store.server");
    const discount = await findCode(data.code);
    if (data.code.trim() && !discount) throw new Error("invalid_discount_code");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: purchase, error } = await (supabaseAdmin as any).rpc("buy_product_with_local_discount", {
      _product_id: data.productId,
      _buyer_id: userId,
      _discount_percent: discount?.discount_percent ?? 0,
      _discount_code: discount?.code ?? null,
    });
    if (error) throw error;
    return purchase;
  });
