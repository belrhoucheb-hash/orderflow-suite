import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  driverThreadKey,
  useThreadMessages,
  useSendMessage,
  useThreadRealtime,
  useMarkThreadRead,
} from "@/hooks/useDriverPlannerMessages";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  driverId: string;
  active: boolean;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function DriverChatPanel({ driverId, active }: Props) {
  const threadKey = driverThreadKey(driverId);
  const [body, setBody] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useThreadMessages(threadKey);
  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead(threadKey);
  useThreadRealtime(threadKey);

  // Cache user-id zodat we van/naar kunnen onderscheiden zonder elke render
  // de session opnieuw op te halen.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setCurrentUserId(data.session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Markeer als gelezen bij openen tab.
  useEffect(() => {
    if (active && messages.length > 0) {
      markRead.mutate();
    }
    // markRead is stable; opzettelijk niet in deps om dubbele triggers te
    // voorkomen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, messages.length]);

  // Scroll-to-bottom bij nieuwe berichten.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await sendMessage.mutateAsync({ threadKey, body: trimmed });
      setBody("");
    } catch (err: any) {
      toast.error(err?.message ?? "Bericht versturen mislukt");
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Planner</p>
          <p className="text-[11px] text-slate-500">Direct contact met je dispatch</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <MessageSquare className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">Nog geen berichten</p>
            <p className="mt-1 text-xs">Stuur de planner een bericht om de chat te starten.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const mine = msg.from_user_id === currentUserId;
            return (
              <div key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    mine
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-900",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-white/70" : "text-slate-500")}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2"
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Schrijf een bericht..."
          className="flex-1 h-10 rounded-xl border-slate-200 bg-white"
          disabled={sendMessage.isPending}
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 rounded-xl"
          disabled={!body.trim() || sendMessage.isPending}
        >
          {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
