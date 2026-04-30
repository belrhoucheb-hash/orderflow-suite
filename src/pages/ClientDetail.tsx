import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Minimize2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClients";
import { ClientDetailPanel } from "@/components/clients/ClientDetailPanel";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ClientDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading, isError, refetch } = useClient(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto w-full">
        <LoadingState message="Klant laden..." />
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-6 max-w-5xl mx-auto w-full">
        <QueryError message="Kan klant niet laden." onRetry={() => refetch()} />
        <div className="mt-4">
          <Button variant="ghost" onClick={() => navigate("/klanten")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar klanten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
      <PageHeader
        eyebrow="Klant"
        title={client.name}
        subtitle={client.contact_person || client.email || "Klantdetail"}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/orders/nieuw?client_id=${client.id}`)}
              className="btn-luxe btn-luxe--primary !h-9"
            >
              <Plus className="h-4 w-4" />
              Nieuwe order
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              title="Klant bewerken"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/klanten")}
              title="Sluiten"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="card--luxe overflow-hidden">
        <ClientDetailPanel client={client} />
      </div>

      <NewClientDialog
        open={editing}
        onOpenChange={(v) => setEditing(v)}
        client={client}
      />
    </div>
  );
}
