import { useState, useRef, useEffect } from "react";
import { Search, Plus, Building2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClients, type Client } from "@/hooks/useClients";
import { ClientDetailPanel } from "@/components/clients/ClientDetailPanel";
import { NewClientDialog } from "@/components/clients/NewClientDialog";

export default function Clients() {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { data: clients, isLoading } = useClients(search);
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

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300" style={{ marginRight: selectedClient ? 480 : 0 }}>
        <div className="flex items-center justify-between px-8 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Klanten</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {clients?.length ?? 0} klanten in het systeem
            </p>
          </div>
          <Button
            onClick={() => setShowNewDialog(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            <Plus className="h-4 w-4" />
            Nieuwe Klant
          </Button>
        </div>

        <div className="px-8 pb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam of email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="px-8 flex-1 overflow-auto pb-8">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Klantnaam</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Contactpersoon</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Telefoon</th>
                  <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actieve Orders</th>
                  <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Laden...</td></tr>
                ) : clients?.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Geen klanten gevonden</td></tr>
                ) : (
                  clients?.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/20 ${
                        selectedClient?.id === client.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{client.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.contact_person || "—"}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.email || "—"}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.phone || "—"}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="text-sm font-medium text-foreground">{client.active_order_count}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge
                          variant={client.is_active ? "default" : "secondary"}
                          className={client.is_active
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/10"
                            : "bg-muted text-muted-foreground"
                          }
                        >
                          {client.is_active ? "Actief" : "Inactief"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedClient && (
        <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-card border-l border-border shadow-xl z-30 overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <h2 className="text-base font-semibold text-foreground">{selectedClient.name}</h2>
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
