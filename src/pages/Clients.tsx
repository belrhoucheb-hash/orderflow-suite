import { useState, useRef, useEffect } from "react";
import { Search, Plus, Building2, X, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useClients, type Client } from "@/hooks/useClients";
import { ClientDetailPanel } from "@/components/clients/ClientDetailPanel";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Clients() {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { data: clients, isLoading, isError, refetch } = useClients(search);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedClient) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedClient(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedClient]);

  const count = clients?.length ?? 0;

  return (
    <div className="flex h-full">
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedClient ? "lg:mr-[420px]" : ""}`}>
        <div className="p-6 space-y-4 max-w-[1800px] mx-auto w-full">
          <PageHeader
            title="Klanten"
            subtitle={`${count} ${count === 1 ? "klant" : "klanten"} in het systeem`}
            actions={
              <button
                type="button"
                onClick={() => setShowNewDialog(true)}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                <Plus className="h-4 w-4" />
                Nieuwe klant
              </button>
            }
          />

          <div className="card--luxe p-4 flex items-center gap-3">
            <Search className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" />
            <Input
              placeholder="Zoek op naam of email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field-luxe flex-1 max-w-md"
            />
          </div>

          <div className="card--luxe overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr
                    className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[12px] [&>th]:!uppercase [&>th]:!tracking-[0.16em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold [&>th]:!py-3.5 [&>th]:!px-5"
                    style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                  >
                    <th className="text-left">Klantnaam</th>
                    <th className="text-left">Contactpersoon</th>
                    <th className="text-left">Email</th>
                    <th className="text-left">Telefoon</th>
                    <th className="text-center">Actieve orders</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6}><LoadingState message="Klanten laden..." /></td></tr>
                  ) : isError ? (
                    <tr><td colSpan={6}>
                      <QueryError message="Kan klantgegevens niet laden." onRetry={() => refetch()} />
                    </td></tr>
                  ) : clients?.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Geen klanten gevonden</td></tr>
                  ) : (
                    clients?.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      return (
                        <tr
                          key={client.id}
                          onClick={() => setSelectedClient(client)}
                          className={`border-b border-[hsl(var(--gold)/0.08)] cursor-pointer transition-colors hover:bg-[hsl(var(--gold-soft)/0.3)] ${
                            isSelected ? "bg-[hsl(var(--gold-soft)/0.5)]" : ""
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-8 w-8 rounded-lg flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
                                style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.3))" }}
                              >
                                <Building2 className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                              </div>
                              <span className="text-sm font-medium text-foreground">{client.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.contact_person || "—"}</td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.email || "—"}</td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.phone || "—"}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-sm font-medium tabular-nums text-foreground">{client.active_order_count}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`badge-status badge-status--luxe ${client.is_active ? "badge-status--delivered" : "badge-status--cancelled"}`}>
                              <span className="badge-status__dot" />
                              {client.is_active ? "Actief" : "Inactief"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedClient && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSelectedClient(null)}
        />
      )}

      {selectedClient && (
        <div
          ref={panelRef}
          className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[420px] bg-card border-l border-[hsl(var(--gold)/0.25)] shadow-2xl z-40 overflow-y-auto"
          style={{ boxShadow: "-12px 0 32px -8px hsl(var(--gold-deep)/0.08)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--gold)/0.2)] sticky top-0 bg-card z-10"
            style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.2) 100%)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelectedClient(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2
                className="text-base font-semibold text-foreground truncate font-display tracking-tight"
                title={selectedClient.name}
              >
                {selectedClient.name}
              </h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedClient(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ClientDetailPanel client={selectedClient} />
        </div>
      )}

      <NewClientDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}
