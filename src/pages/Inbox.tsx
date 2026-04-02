import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Upload, FlaskConical, CheckCircle2, Loader2, Inbox as InboxIcon, CircleAlert, Send, FileEdit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SourcePanel } from "@/components/inbox/InboxSourcePanel";
import { InboxListItem } from "@/components/inbox/InboxListItem";
import { InboxReviewPanel } from "@/components/inbox/InboxReviewPanel";
import { TEST_SCENARIOS, getFormErrors } from "@/components/inbox/utils";
import { useInbox } from "@/hooks/useInbox";

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
    addressSuggestions,
    tenant,

    isCreatePending,

    handleImportEmail,
    handleLoadTestScenario,
    handleCreateOrder,
    handleDelete,
    handleAutoSave,
    updateField,
    toggleRequirement,
    enrichAddresses,
    setFormData,
    createOrderMutation,
    deleteMutation,
  } = useInbox();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Inbox laden...</p>
        </div>
      </div>
    );
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
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 gap-2 shrink-0 hidden lg:flex">
        <div className="mb-4 px-2">
          <p className="text-primary font-black tracking-tighter text-sm uppercase">Dispatch Hub</p>
          <p className="text-[11px] text-gray-400">{tenant?.name || "Royalty Cargo"}</p>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          {[
            { key: "alle" as const, label: "Alle", icon: InboxIcon, count: drafts.length },
            { key: "actie" as const, label: "Actie nodig", icon: CircleAlert, count: needsAction.length },
            { key: "klaar" as const, label: "Klaar", icon: CheckCircle2, count: readyToGo.length },
            { key: "verzonden" as const, label: "Verzonden", icon: Send, count: 0 },
            { key: "concepten" as const, label: "Concepten", icon: FileEdit, count: 0 },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setSidebarFilter(item.key)}
              className={cn(
                "rounded-lg flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-all w-full whitespace-nowrap",
                sidebarFilter === item.key
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50",
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  sidebarFilter === item.key && item.key === "actie" && "text-primary",
                )}
              />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold shrink-0 min-w-[20px] text-center",
                    item.key === "actie" && item.count > 0
                      ? "bg-primary text-white px-1.5 py-0.5 rounded-full"
                      : "text-gray-400",
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-gray-100 pt-4 space-y-1">
          <button
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-3 px-3 py-2 text-xs font-medium transition-all w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Importeer .eml
          </button>
          <button
            className="text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg flex items-center gap-3 px-3 py-2 text-xs font-medium transition-all w-full"
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
            <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
              <div>
                <h3
                  className="text-lg font-bold tracking-tight"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Inbox
                </h3>
                <p className="text-[10px] text-gray-400">Laatst gesynchroniseerd: 2 min geleden</p>
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  placeholder="Zoek op order of klant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white transition-all"
                />
              </div>
              {/* Filter dropdowns */}
              <div className="flex gap-1.5">
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="">Datum</option>
                  <option value="today">Vandaag</option>
                  <option value="week">Deze week</option>
                  <option value="month">Deze maand</option>
                </select>
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary"
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
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary"
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
                onUpdateField={updateField}
                onToggleRequirement={toggleRequirement}
                onAutoSave={handleAutoSave}
                onCreateOrder={handleCreateOrder}
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
