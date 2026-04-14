import { useState, useMemo, useRef, useEffect } from "react";
import { Mail as MailIcon, Send, FileEdit, Inbox, Search, Star, StarOff, Paperclip, Clock, ChevronLeft, Reply, Forward, RefreshCw, Plus, Bot, CheckCircle2, Save, Archive, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface EmailMessage {
  id: string;
  order_number: number;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  clientName: string | null;
  hasAttachments: boolean;
  attachmentCount: number;
  threadType: string;
  confidenceScore: number | null;
  status: string;
  isStarred: boolean;
  followUpSentAt: string | null;
}

type Folder = "inbox" | "sent" | "drafts";

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function Mail() {
  const queryClient = useQueryClient();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("mail-stars");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("mail-stars", JSON.stringify(starredIds));
  }, [starredIds]);
  const [showCompose, setShowCompose] = useState(false);
  const [composeBody, setComposeBody] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeContent, setComposeContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Fetch all orders that have email data
  const { data: rawEmails = [], isLoading, refetch } = useQuery({
    queryKey: ["mail-emails", folder],
    queryFn: async () => {
      let query = supabase.from("orders").select("id, order_number, source_email_from, source_email_subject, source_email_body, received_at, client_name, attachments, thread_type, confidence_score, status, follow_up_sent_at, follow_up_draft, missing_fields")
        .not("source_email_from", "is", null)
        .order("received_at", { ascending: false });

      if (folder === "inbox") {
        query = query.eq("status", "DRAFT");
      } else if (folder === "sent") {
        // Orders where a follow-up was sent OR status is beyond DRAFT (processed/sent)
        query = query.or("follow_up_sent_at.not.is.null,status.neq.DRAFT");
      } else if (folder === "drafts") {
        // DRAFT orders that have an unsent follow-up draft
        query = query.eq("status", "DRAFT").not("follow_up_draft", "is", null);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Fetch counts for all folders
  const { data: folderCountData } = useQuery({
    queryKey: ["mail-folder-counts"],
    queryFn: async () => {
      const [inboxRes, sentRes, draftsRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("source_email_from", "is", null)
          .eq("status", "DRAFT"),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("source_email_from", "is", null)
          .or("follow_up_sent_at.not.is.null,status.neq.DRAFT"),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("source_email_from", "is", null)
          .eq("status", "DRAFT")
          .not("follow_up_draft", "is", null),
      ]);
      return {
        inbox: inboxRes.count ?? 0,
        sent: sentRes.count ?? 0,
        drafts: draftsRes.count ?? 0,
      };
    },
  });

  const emails: EmailMessage[] = useMemo(() =>
    rawEmails.map((r: any) => ({
      id: r.id,
      order_number: r.order_number,
      from: r.source_email_from || "",
      subject: r.source_email_subject || "(Geen onderwerp)",
      body: r.source_email_body || "",
      receivedAt: r.received_at || r.created_at,
      clientName: r.client_name,
      hasAttachments: (r.attachments || []).length > 0,
      attachmentCount: (r.attachments || []).length,
      threadType: r.thread_type || "new",
      confidenceScore: r.confidence_score,
      status: r.status,
      isStarred: starredIds.includes(r.id),
      followUpSentAt: r.follow_up_sent_at,
    })),
    [rawEmails, starredIds]
  );

  const filtered = useMemo(() =>
    emails.filter(e =>
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      (e.clientName || "").toLowerCase().includes(search.toLowerCase()) ||
      e.from.toLowerCase().includes(search.toLowerCase())
    ),
    [emails, search]
  );

  const selected = filtered.find(e => e.id === selectedId);

  const toggleStar = (id: string) => {
    setStarredIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const folderCounts = {
    inbox: folderCountData?.inbox ?? 0,
    sent: folderCountData?.sent ?? 0,
    drafts: folderCountData?.drafts ?? 0,
  };

  const folders = [
    { key: "inbox" as Folder, label: "Inbox", icon: Inbox, count: folderCounts.inbox },
    { key: "sent" as Folder, label: "Verzonden", icon: Send, count: folderCounts.sent },
    { key: "drafts" as Folder, label: "Concepten", icon: FileEdit, count: folderCounts.drafts },
  ];

  const threadTypeLabel: Record<string, { label: string; color: string }> = {
    new: { label: "Nieuw", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
    update: { label: "Wijziging", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
    cancellation: { label: "Annulering", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
    confirmation: { label: "Bevestiging", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
    question: { label: "Vraag", color: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400" },
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-4 md:-m-6 bg-background">

      {/* ─── Sidebar: Folders ─── */}
      <div className={cn("w-56 border-r border-border/40 bg-card flex flex-col shrink-0", "hidden md:flex")}>
        <div className="p-4 pb-3">
          <Button onClick={() => setShowCompose(true)} className="w-full bg-primary hover:bg-primary/90 text-white h-10 text-sm font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nieuw bericht
          </Button>
        </div>
        <nav className="flex-1 px-2">
          {folders.map(f => (
            <button
              key={f.key}
              onClick={() => { setFolder(f.key); setSelectedId(""); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                folder === f.key ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <f.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{f.label}</span>
              {f.count > 0 && <span className="text-xs font-bold">{f.count}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground/50 text-center">Communicatie met klanten en partners</p>
        </div>
      </div>

      {/* ─── Mail List ─── */}
      <div className={cn(
        "border-r border-border/40 flex flex-col shrink-0",
        "w-full md:w-80",
        selected ? "hidden lg:flex" : "flex"
      )}>
        {/* Toolbar */}
        <div className="p-4 border-b border-border/30 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">E-mail</h2>
              <p className="text-[10px] text-muted-foreground">Communicatie met klanten en partners</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {/* Filter: binnenkort beschikbaar */}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Zoek in e-mails..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/30 border-0"
            />
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <MailIcon className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Geen e-mails gevonden</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map(email => (
                <button
                  key={email.id}
                  onClick={() => setSelectedId(email.id)}
                  className={cn(
                    "w-full text-left p-3 transition-colors hover:bg-muted/30",
                    selectedId === email.id && "bg-primary/[0.05] border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-muted-foreground">{getInitials(email.clientName || email.from)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + time */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground truncate">{email.clientName || email.from}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatTime(email.receivedAt)}</span>
                      </div>
                      {/* Row 2: Subject */}
                      <p className="text-xs text-foreground/80 truncate mb-0.5">{email.subject}</p>
                      {/* Row 3: Preview */}
                      <p className="text-xs text-muted-foreground truncate">{email.body.slice(0, 80)}</p>
                      {/* Row 4: Badges */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {email.threadType !== "new" && threadTypeLabel[email.threadType] && (
                          <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", threadTypeLabel[email.threadType].color)}>
                            {threadTypeLabel[email.threadType].label}
                          </span>
                        )}
                        {email.confidenceScore != null && email.confidenceScore > 0 && (
                          <span className={cn(
                            "text-xs font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5",
                            email.confidenceScore >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            <Bot className="h-2.5 w-2.5" /> {email.confidenceScore}%
                          </span>
                        )}
                        {email.hasAttachments && (
                          <Paperclip className="h-3 w-3 text-muted-foreground/40" />
                        )}
                        {email.followUpSentAt && (
                          <span className="text-xs font-medium text-primary flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Follow-up
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Star */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(email.id); }}
                      className="shrink-0 mt-1"
                    >
                      {email.isStarred
                        ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        : <StarOff className="h-3.5 w-3.5 text-muted-foreground/20 hover:text-amber-400" />
                      }
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ─── Email Detail ─── */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-background",
        !selected ? "hidden lg:flex" : "flex"
      )}>
        {selected ? (
          <>
            {/* Email toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setSelectedId("")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* Archiveren & verwijderen: binnenkort beschikbaar */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" disabled>
                          <Archive className="h-3.5 w-3.5" /> Archiveren
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Binnenkort beschikbaar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" disabled>
                          <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Binnenkort beschikbaar</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    setComposeBody(`RE: ${selected.subject}\n\n`);
                    setTimeout(() => replyRef.current?.focus(), 100);
                  }}>
                  <Reply className="h-3.5 w-3.5" /> Beantwoorden
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    setComposeSubject(`FW: ${selected.subject}`);
                    setComposeContent(`\n\n---------- Doorgestuurd bericht ----------\nVan: ${selected.from}\nOnderwerp: ${selected.subject}\n\n${selected.body}`);
                    setComposeTo("");
                    setShowCompose(true);
                  }}>
                  <Forward className="h-3.5 w-3.5" /> Doorsturen
                </Button>
                {/* Meer opties: binnenkort beschikbaar */}
              </div>
            </div>

            {/* Email header */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground leading-snug pr-4">{selected.subject}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  {selected.threadType !== "new" && threadTypeLabel[selected.threadType] && (
                    <span className={cn("text-xs font-bold px-2 py-1 rounded uppercase tracking-wider", threadTypeLabel[selected.threadType].color)}>
                      {threadTypeLabel[selected.threadType].label}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs">Order #{selected.order_number}</Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-muted-foreground">{getInitials(selected.clientName || selected.from)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{selected.clientName || selected.from}</span>
                    <span className="text-xs text-muted-foreground">&lt;{selected.from}&gt;</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.receivedAt).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    {" om "}
                    {new Date(selected.receivedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {selected.confidenceScore != null && selected.confidenceScore > 0 && (
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold",
                    selected.confidenceScore >= 80 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : selected.confidenceScore >= 60 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  )}>
                    <Bot className="h-3.5 w-3.5" />
                    AI: {selected.confidenceScore}%
                  </div>
                )}
              </div>

              {selected.hasAttachments && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{selected.attachmentCount} bijlage{selected.attachmentCount !== 1 ? "n" : ""}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Email body */}
            <ScrollArea className="flex-1">
              <div className="p-4">
                <p className="text-sm text-foreground/80 leading-[1.85] whitespace-pre-wrap">{selected.body}</p>
              </div>
            </ScrollArea>

            {/* Quick reply */}
            <div className="border-t border-border/30 p-4">
              <div className="flex items-end gap-2 min-w-0">
                <Textarea
                  ref={replyRef}
                  placeholder="Snel antwoorden..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="min-h-[44px] max-h-[120px] text-sm resize-none min-w-0"
                />
                <Button size="sm" className="h-10 px-4 gap-1.5 shrink-0" disabled={!composeBody.trim() || isSending}
                  onClick={async () => {
                    if (!selected) return;
                    setIsSending(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("send-follow-up", {
                        body: {
                          orderId: selected.id,
                          toEmail: selected.from,
                          subject: `Re: ${selected.subject}`,
                          body: composeBody,
                        },
                      });
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      queryClient.invalidateQueries({ queryKey: ["mail-emails"] });
                      queryClient.invalidateQueries({ queryKey: ["mail-folder-counts"] });
                      toast.success("Antwoord verzonden", { description: `E-mail gestuurd naar ${selected.from}` });
                      setComposeBody("");
                    } catch (e: any) {
                      console.error("Send reply error:", e);
                      toast.error("Verzenden mislukt", { description: e.message || "Probeer opnieuw" });
                    } finally {
                      setIsSending(false);
                    }
                  }}>
                  <Send className="h-3.5 w-3.5" /> Verstuur
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MailIcon}
              title="Selecteer een e-mail"
              description="Kies een bericht uit de lijst om te lezen"
            />
          </div>
        )}
      </div>

      {/* Compose overlay */}
      {showCompose && (
        <div className="fixed inset-0 z-50 sm:flex sm:items-end sm:justify-end sm:p-6 sm:pointer-events-none">
          <div className="w-full h-full sm:h-auto sm:w-[480px] bg-card sm:rounded-t-xl shadow-2xl border border-border/40 pointer-events-auto flex flex-col sm:max-h-[70vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/30 rounded-t-xl">
              <span className="text-sm font-semibold">Nieuw bericht</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCompose(false)}>
                <ChevronLeft className="h-4 w-4 rotate-[270deg]" />
              </Button>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-auto">
              <div>
                <Input placeholder="Aan: naam@bedrijf.nl" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} className="h-9 text-sm border-0 border-b border-border/30 rounded-none px-0 focus-visible:ring-0" />
              </div>
              <div>
                <Input placeholder="Onderwerp" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} className="h-9 text-sm border-0 border-b border-border/30 rounded-none px-0 focus-visible:ring-0" />
              </div>
              <Textarea placeholder="Schrijf je bericht..." value={composeContent} onChange={(e) => setComposeContent(e.target.value)} className="min-h-[200px] text-sm border-0 resize-none focus-visible:ring-0 p-0" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <div className="flex items-center gap-1">
                {/* Bijlagen: binnenkort beschikbaar */}
              </div>
              <Button size="sm" className="h-9 px-5 gap-1.5" disabled={isSending || !composeTo.trim() || !composeSubject.trim()}
                onClick={async () => {
                  setIsSending(true);
                  try {
                    const { error } = await supabase.from("orders").insert({
                      source_email_from: composeTo.trim(),
                      source_email_subject: composeSubject.trim(),
                      source_email_body: composeContent,
                      status: "DRAFT",
                      received_at: new Date().toISOString(),
                    });
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["mail-emails"] });
                    queryClient.invalidateQueries({ queryKey: ["mail-folder-counts"] });
                    toast.success("Concept opgeslagen", { description: "Bericht is opgeslagen als concept" });
                    setShowCompose(false);
                    setComposeTo("");
                    setComposeSubject("");
                    setComposeContent("");
                  } catch (e: any) {
                    console.error("Create draft error:", e);
                    toast.error("Opslaan mislukt", { description: e.message || "Probeer opnieuw" });
                  } finally {
                    setIsSending(false);
                  }
                }}>
                <Save className="h-3.5 w-3.5" /> Opslaan als concept
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
