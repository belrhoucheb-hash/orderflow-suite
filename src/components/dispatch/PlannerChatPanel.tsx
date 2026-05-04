import { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageSquare, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  driverThreadKey,
  useDriverThreadsRealtime,
  usePlannerDriverThreads,
  useThreadMessages,
  useThreadRealtime,
  useSendMessage,
  useMarkThreadRead,
} from "@/hooks/useDriverPlannerMessages";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} u`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function PlannerChatPanel() {
  const [search, setSearch] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading: loadingThreads } = usePlannerDriverThreads();
  useDriverThreadsRealtime();

  const selectedThread = useMemo(
    () => threads.find((t) => t.driverId === selectedDriverId) ?? null,
    [threads, selectedDriverId],
  );
  const threadKey = selectedThread ? selectedThread.threadKey : null;

  const { data: messages = [], isLoading: loadingMessages } = useThreadMessages(threadKey);
  useThreadRealtime(threadKey);
  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead(threadKey);

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

  // Auto-pick eerste thread bij eerste laden.
  useEffect(() => {
    if (!selectedDriverId && threads.length > 0) {
      setSelectedDriverId(threads[0].driverId);
    }
  }, [threads, selectedDriverId]);

  // Markeer als gelezen wanneer thread wisselt of berichten binnenkomen.
  useEffect(() => {
    if (threadKey && messages.length > 0) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, threadKey]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.driverName.toLowerCase().includes(q));
  }, [threads, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !selectedThread.driverUserId) {
      toast.error("Deze chauffeur heeft nog geen gekoppelde gebruiker");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await sendMessage.mutateAsync({
        threadKey: selectedThread.threadKey,
        body: trimmed,
        toUserId: selectedThread.driverUserId,
      });
      setBody("");
    } catch (err: any) {
      toast.error(err?.message ?? "Bericht versturen mislukt");
    }
  };

  return (
    <div className="grid h-full grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Lijst */}
      <aside className="flex flex-col border-r border-slate-200">
        <div className="border-b border-slate-200 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Berichten</p>
          <div className="mt-2 relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek chauffeur"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : filteredThreads.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">Geen chauffeurs gevonden.</p>
          ) : (
            filteredThreads.map((thread) => {
              const active = thread.driverId === selectedDriverId;
              return (
                <button
                  key={thread.driverId}
                  onClick={() => setSelectedDriverId(thread.driverId)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors",
                    active ? "bg-primary/5" : "hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      active ? "bg-primary text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {thread.driverName
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{thread.driverName}</p>
                      {thread.lastMessage && (
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatRelative(thread.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {thread.lastMessage?.body ?? "Nog geen berichten"}
                    </p>
                  </div>
                  {thread.unreadCount > 0 && (
                    <span className="ml-1 mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {thread.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex flex-col">
        {!selectedThread ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">Kies een chauffeur</p>
              <p className="mt-1 text-xs">Selecteer links een gesprek om te starten.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {selectedThread.driverName
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedThread.driverName}</p>
                <p className="text-[11px] text-slate-500">
                  {selectedThread.driverUserId ? "Online beschikbaar" : "Geen gebruiker gekoppeld"}
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-xs text-slate-400">Nog geen berichten in deze thread.</p>
              ) : (
                messages.map((msg) => {
                  const mine = msg.from_user_id === currentUserId;
                  return (
                    <div key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          mine ? "bg-primary text-white" : "bg-slate-100 text-slate-900",
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

            <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  selectedThread.driverUserId
                    ? "Schrijf een bericht..."
                    : "Chauffeur heeft geen gebruikersaccount, chatten niet mogelijk."
                }
                className="flex-1 h-10 rounded-xl border-slate-200 bg-white"
                disabled={sendMessage.isPending || !selectedThread.driverUserId}
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-xl"
                disabled={!body.trim() || sendMessage.isPending || !selectedThread.driverUserId}
              >
                {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
