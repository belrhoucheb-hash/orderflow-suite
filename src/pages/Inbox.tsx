import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Upload, FlaskConical, CheckCircle2, Inbox as InboxIcon, CircleAlert, Send, FileEdit } from "lucide-react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SourcePanel } from "@/components/inbox/InboxSourcePanel";
import { InboxListItem } from "@/components/inbox/InboxListItem";
import { InboxReviewPanel } from "@/components/inbox/InboxReviewPanel";
import { TEST_SCENARIOS, getFormErrors } from "@/components/inbox/utils";
import { useInbox } from "@/hooks/useInbox";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";
import { AlertCircle, CheckCheck, Clock3, MailCheck } from "lucide-react";

export default function Inbox() {
  const {
    selectedId,
    setSelectedId,
    formData,
    search,
    setSearch,
    sidebarFilter,
    setSidebarFilter,
    filterDate,
    setFilterDate,
    filterClient,
    setFilterClient,
    filterType,
    setFilterType,
    mobileView,
    setMobileView,
    bulkSelected,
    setBulkSelected,
    loadingScenario,
    fileInputRef,

    drafts,
    isLoading,
    selected,
    form,
    filtered,
    needsAction,
    readyToGo,
    autoConfirmCandidates,
    intakeQueueStats,
    addressSuggestions,
    tenant,

    isCreatePending,

    handleImportEmail,
    handleLoadTestScenario,
    handleCreateOrder,
    handleAutoConfirmAllSafe,
    handleAutoConfirmCurrent,
    handleAutoConfirmSelected,
    handleDelete,
    handleAutoSave,
    updateField,
    toggleRequirement,
    enrichAddresses,
    setFormData,
    createOrderMutation,
    deleteMutation,
    getDraftAutoConfirmAssessment,
  } = useInbox();

  if (isLoading) {
    return <LoadingState message="Inbox laden..." />;
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-4 md:-m-6 bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept=".eml,.msg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportEmail(file);
        }}
      />

      {/* Left Sidebar */}
      <div className="hidden w-56 shrink-0 border-r border-[hsl(var(--gold)/0.08)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),white_22%)] p-4 lg:flex lg:flex-col lg:gap-2">
        <div className="mb-4 px-2">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">AI Inbox</p>
          <p className="mt-1 text-sm font-medium text-foreground">{tenant?.name || DEFAULT_COMPANY.name}</p>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          {[
            { key: "alle" as const, label: "Alle", icon: InboxIcon, count: drafts.length },
            { key: "actie" as const, label: "Actie nodig", icon: CircleAlert, count: needsAction.length },
            { key: "klaar" as const, label: "Klaar", icon: CheckCircle2, count: readyToGo.length },
            { key: "autoconfirm" as const, label: "Auto-confirm", icon: CheckCircle2, count: autoConfirmCandidates.length },
            { key: "verzonden" as const, label: "Verzonden", icon: Send, count: 0 },
            { key: "concepten" as const, label: "Concepten", icon: FileEdit, count: 0 },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setSidebarFilter(item.key)}
              className={cn(
                "relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all",
                sidebarFilter === item.key
                  ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.42),hsl(var(--gold-soft)/0.18))] text-[hsl(var(--gold-deep))] shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.08)]"
                  : "text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-foreground",
              )}
            >
              {sidebarFilter === item.key && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-[hsl(var(--gold-deep))]" aria-hidden="true" />
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  sidebarFilter === item.key ? "text-[hsl(var(--gold-deep))]" : item.key === "actie" ? "text-primary/80" : "",
                )}
              />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.count > 0 && (
                <span
                  className={cn(
                    "min-w-[20px] shrink-0 text-center text-[10px] font-bold",
                    item.key === "actie" && item.count > 0
                      ? "bg-primary text-white px-1.5 py-0.5 rounded-full"
                      : sidebarFilter === item.key
                        ? "text-[hsl(var(--gold-deep))]"
                        : "text-muted-foreground/70",
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-[hsl(var(--gold)/0.08)] pt-4">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Importeer .eml
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-[hsl(var(--gold-deep))]"
            disabled={loadingScenario !== null}
            onClick={async () => {
              for (let i = 0; i < TEST_SCENARIOS.length; i++) {
                await handleLoadTestScenario(i);
              }
            }}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {loadingScenario !== null ? "Laden..." : "Laad testdata"}
          </button>
        </div>
      </div>

      {/* Resizable 3-column content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Mail List */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
          <div className="flex flex-col h-full bg-white" style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              className="h-14 px-4 flex items-baseline justify-between gap-2 border-b shrink-0"
              style={{ borderColor: "hsl(var(--gold) / 0.1)", background: "linear-gradient(180deg, hsl(var(--gold-soft) / 0.08), hsl(var(--card)))" }}
            >
              <h3
                className="text-[15px] font-semibold text-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}
              >
                Inbox
              </h3>
              <p
                className="text-[11px] tabular-nums text-muted-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.01em" }}
              >
                <strong className="text-foreground font-semibold">{drafts.length}</strong>
                <span className="mx-1.5">·</span>
                <span>{needsAction.length} te reviewen</span>
                <span className="mx-1.5">·</span>
                <span>{autoConfirmCandidates.length} auto-confirm klaar</span>
              </p>
            </div>
            {autoConfirmCandidates.length > 0 && (
              <div className="mx-3 mb-2 rounded-2xl border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(236,253,245,0.78))] px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-900">Veilige intakekandidaten</p>
                    <p className="text-[11px] text-emerald-700">
                      {autoConfirmCandidates.length} order{autoConfirmCandidates.length > 1 ? "s" : ""} kunnen zonder extra review door.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSidebarFilter("autoconfirm");
                      setBulkSelected(new Set(autoConfirmCandidates.map((draft) => draft.id)));
                      handleAutoConfirmAllSafe();
                    }}
                    className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Bevestig veilig
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  {
                    key: "actie",
                    label: "Actie nodig",
                    count: intakeQueueStats.needsAction,
                    helper: "Review",
                    icon: AlertCircle,
                    active: sidebarFilter === "actie",
                    tone: "border-amber-200/60 bg-[linear-gradient(180deg,rgba(255,251,235,0.84),rgba(255,251,235,0.58))] text-amber-950",
                  },
                  {
                    key: "autoconfirm",
                    label: "Veilig",
                    count: intakeQueueStats.autoConfirm,
                    helper: "Direct door",
                    icon: CheckCheck,
                    active: sidebarFilter === "autoconfirm",
                    tone: "border-emerald-200/60 bg-[linear-gradient(180deg,rgba(236,253,245,0.84),rgba(236,253,245,0.58))] text-emerald-950",
                  },
                  {
                    key: "concepten",
                    label: "Wacht op info",
                    count: intakeQueueStats.waitingForInfo,
                    helper: "Follow-up",
                    icon: Clock3,
                    active: sidebarFilter === "concepten",
                    tone: "border-sky-200/60 bg-[linear-gradient(180deg,rgba(240,249,255,0.84),rgba(240,249,255,0.58))] text-sky-950",
                  },
                  {
                    key: "verzonden",
                    label: "Reactie",
                    count: intakeQueueStats.followUpSent,
                    helper: "Verstuurd",
                    icon: MailCheck,
                    active: sidebarFilter === "verzonden",
                    tone: "border-slate-200/60 bg-[linear-gradient(180deg,rgba(248,250,252,0.88),rgba(248,250,252,0.64))] text-slate-900",
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setSidebarFilter(item.key as typeof sidebarFilter)}
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-left transition-all",
                      item.tone,
                      item.active ? "ring-1 ring-[hsl(var(--gold)/0.22)] shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.08)]" : "hover:border-[hsl(var(--gold)/0.16)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold tracking-[0.01em]">{item.label}</p>
                        <p className="mt-0.5 text-[10px] opacity-70">{item.helper}</p>
                      </div>
                      <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-55" />
                    </div>
                    <p className="mt-2 text-[1.1rem] font-semibold leading-none tabular-nums">{item.count}</p>
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--gold-deep)/0.5)]" />
                <input
                  placeholder="Zoek op order of klant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all focus:bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold)/0.2)]"
                />
              </div>
              {/* Filter dropdowns */}
              <div className="flex gap-2">
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="h-8 rounded-lg border border-[hsl(var(--gold)/0.1)] bg-white px-2.5 text-xs text-muted-foreground focus:border-[hsl(var(--gold)/0.18)] focus:ring-1 focus:ring-[hsl(var(--gold)/0.18)]"
                >
                  <option value="">Datum</option>
                  <option value="today">Vandaag</option>
                  <option value="week">Deze week</option>
                  <option value="month">Deze maand</option>
                </select>
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="h-8 rounded-lg border border-[hsl(var(--gold)/0.1)] bg-white px-2.5 text-xs text-muted-foreground focus:border-[hsl(var(--gold)/0.18)] focus:ring-1 focus:ring-[hsl(var(--gold)/0.18)]"
                >
                  <option value="">Klant</option>
                  {[...new Set(drafts.map((d) => d.client_name).filter(Boolean))].map((name) => (
                    <option key={name} value={name!}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="h-8 rounded-lg border border-[hsl(var(--gold)/0.1)] bg-white px-2.5 text-xs text-muted-foreground focus:border-[hsl(var(--gold)/0.18)] focus:ring-1 focus:ring-[hsl(var(--gold)/0.18)]"
                >
                  <option value="">Type</option>
                  <option value="new">Nieuw</option>
                  <option value="update">Update</option>
                  <option value="cancellation">Annulering</option>
                </select>
              </div>
            </div>

            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div className="px-3 py-2 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">{bulkSelected.size} geselecteerd</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      Array.from(bulkSelected).forEach((id) => {
                        const f = formData[id];
                        if (f && !getFormErrors(f)) createOrderMutation.mutate({ id, form: f });
                      });
                      setBulkSelected(new Set());
                    }}
                    className="text-xs font-semibold text-green-600 hover:underline"
                  >
                    Goedkeuren
                  </button>
                  <button onClick={handleAutoConfirmSelected} className="text-xs font-semibold text-emerald-700 hover:underline">
                    Auto-confirmeer veilig
                  </button>
                  <button
                    onClick={() => {
                      Array.from(bulkSelected).forEach((id) => deleteMutation.mutate(id));
                      setBulkSelected(new Set());
                    }}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Verwijder
                  </button>
                  <button onClick={() => setBulkSelected(new Set())} className="text-xs text-gray-400 hover:underline">
                    Annuleer
                  </button>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
              <div>
                {filtered.map((draft) => (
                  <InboxListItem
                    key={draft.id}
                    draft={draft}
                    isSelected={selectedId === draft.id}
                    bulkMode={bulkSelected.size > 0}
                    isBulkChecked={bulkSelected.has(draft.id)}
                    onBulkToggle={(id) =>
                      setBulkSelected((prev) => {
                        const n = new Set(prev);
                        if (n.has(id)) n.delete(id);
                        else n.add(id);
                        return n;
                      })
                    }
                    onClick={() => {
                      setSelectedId(draft.id);
                      setMobileView("source");
                    }}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-16 px-4">
                    <InboxIcon className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-400">Geen berichten</p>
                    <p className="text-xs text-gray-300 mt-1">Pas je filters aan of importeer een e-mail</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="bg-white border-t border-gray-100 p-2 text-center shrink-0 hidden lg:block">
              <p className="text-[10px] text-gray-400 font-medium font-mono">
                {"\u2191\u2193"} navigeren {"\u00B7"} Enter openen {"\u00B7"} Del archiveren
              </p>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Email Panel + Review Panel */}
        {selected && form ? (
          <>
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="flex flex-col h-full bg-white" style={{ minWidth: 0, overflow: "hidden" }}>
                <SourcePanel
                  selected={selected}
                  form={form}
                  onParseResult={(data) => {
                    if (!selected) return;
                    const { result: enriched, enrichments } = enrichAddresses(data);
                    setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], ...enriched } }));
                  }}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={33} minSize={20}>
              <InboxReviewPanel
                selected={selected}
                form={form}
                isCreatePending={isCreatePending}
                addressSuggestions={addressSuggestions}
                autoConfirmAssessment={getDraftAutoConfirmAssessment(selected)}
                onUpdateField={updateField}
                onToggleRequirement={toggleRequirement}
                onAutoSave={handleAutoSave}
                onCreateOrder={handleCreateOrder}
                onAutoConfirm={handleAutoConfirmCurrent}
                onDelete={handleDelete}
              />
            </ResizablePanel>
          </>
        ) : (
          <ResizablePanel defaultSize={78}>
            <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
              <div className="text-center max-w-xs">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <InboxIcon className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-base font-semibold text-gray-700 mb-1">Selecteer een e-mail</p>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Kies een bericht uit de lijst om de inhoud te bekijken en te reviewen voor orderverwerking.
                </p>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-300">
                  <span>{"\u2191\u2193"} navigeer</span>
                  <span>{"\u00B7"}</span>
                  <span>Enter open</span>
                </div>
              </div>
            </div>
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
