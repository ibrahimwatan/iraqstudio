import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Lock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { timeLeftLabel } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ChatPurchase = {
  id: string;
  user_id: string;
  merchant_id: string | null;
  chat_opened_at?: string | null;
  chat_expires_at: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function PurchaseChat({ purchase }: { purchase: ChatPurchase }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [chatState, setChatState] = useState({
    openedAt: purchase.chat_opened_at ?? null,
    expiresAt: purchase.chat_expires_at,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const open = Boolean(chatState.expiresAt && new Date(chatState.expiresAt).getTime() > now);
  const left = chatState.expiresAt ? timeLeftLabel(chatState.expiresAt) : null;

  const messages = useQuery({
    queryKey: ["purchase-messages", purchase.id],
    refetchInterval: open ? 6000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_messages")
        .select("id, sender_id, body, created_at")
        .eq("purchase_id", purchase.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("purchase_messages")
        .insert({ purchase_id: purchase.id, sender_id: user!.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["purchase-messages", purchase.id] });
    },
    onError: () => toast.error("تعذر إرسال الرسالة — قد تكون المحادثة مغلقة"),
  });

  function label(senderId: string) {
    if (senderId === user?.id) return "أنت";
    if (senderId === purchase.user_id) return "المشتري";
    if (senderId === purchase.merchant_id) return "التاجر";
    return "الإدارة";
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-elevated p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {!chatState.openedAt ? (
          <>
            <Clock className="size-3.5 text-muted-foreground" />
            <span>جاري فتح المحادثة...</span>
          </>
        ) : open ? (
          <>
            <Clock className="size-3.5 text-success" />
            <span>المحادثة مفتوحة — تُغلق بعد {left}</span>
          </>
        ) : (
          <>
            <Lock className="size-3.5 text-destructive" />
            <span>أُغلقت المحادثة (مرّت 24 ساعة على فتحها)</span>
          </>
        )}
      </div>

      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {messages.isLoading && <p className="text-[12px] text-muted-foreground">جاري التحميل...</p>}
        {messages.data?.length === 0 && (
          <p className="text-[12px] text-muted-foreground">لا توجد رسائل بعد — ابدأ المحادثة مع التاجر والإدارة.</p>
        )}
        {messages.data?.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border px-3 py-2 ${
              m.sender_id === user?.id ? "border-primary/40 bg-primary/10" : "border-border bg-card"
            }`}
          >
            <p className="font-display text-[11px] font-bold text-muted-foreground">
              {label(m.sender_id)} ·{" "}
              {new Date(m.created_at).toLocaleString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{m.body}</p>
          </div>
        ))}
      </div>

      {open && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            send.mutate();
          }}
        >
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="اكتب رسالتك للتاجر أو الإدارة..."
            className="text-[12.5px]"
          />
          <Button type="submit" size="icon" aria-label="إرسال" disabled={send.isPending}>
            <Send className="size-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
