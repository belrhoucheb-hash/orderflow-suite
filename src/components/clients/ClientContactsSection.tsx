import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Plus, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  useClientContacts,
  useDeleteClientContact,
  useAssignContactRole,
  type ClientContact,
} from "@/hooks/useClientContacts";
import { CLIENT_CONTACT_ROLE_LABELS } from "@/lib/validation/clientContactSchema";
import { ClientContactDialog } from "./ClientContactDialog";

interface Props {
  clientId: string;
}

export function ClientContactsSection({ clientId }: Props) {
  const { data: contacts, isLoading } = useClientContacts(clientId);
  const remove = useDeleteClientContact();
  const assign = useAssignContactRole();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | undefined>(undefined);
  const [deleteCandidate, setDeleteCandidate] = useState<ClientContact | null>(null);

  const openNew = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (contact: ClientContact) => {
    setEditing(contact);
    setDialogOpen(true);
  };

  const handleAssign = async (
    contact: ClientContact,
    role: "primary" | "backup",
  ) => {
    try {
      await assign.mutateAsync({ contactId: contact.id, clientId, role });
      toast.success(`${contact.name} is nu ${CLIENT_CONTACT_ROLE_LABELS[role].toLowerCase()}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Toewijzen mislukt");
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      await remove.mutateAsync({ id: deleteCandidate.id, clientId });
      toast.success("Contactpersoon verwijderd");
    } catch (err: any) {
      toast.error(err?.message ?? "Verwijderen mislukt");
    } finally {
      setDeleteCandidate(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Laden...</p>;
  }

  const rows = contacts ?? [];
  const sorted = [...rows].sort((a, b) => {
    const order: Record<string, number> = { primary: 0, backup: 1, other: 2 };
    const diff = (order[a.role] ?? 99) - (order[b.role] ?? 99);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nog geen contactpersonen"
            : `${rows.length} contactperso${rows.length === 1 ? "on" : "nen"}`}
        </p>
        <button type="button" onClick={openNew} className="btn-luxe !h-8 !px-3 !text-[12px]">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Toevoegen
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Voeg een primair en backup contactpersoon toe.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between rounded-xl border border-[hsl(var(--gold)/0.2)] p-3 gap-3"
              style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <RoleBadge role={c.role} />
                  {!c.is_active && (
                    <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px] !text-muted-foreground">Inactief</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {c.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" strokeWidth={1.5} />
                      {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" strokeWidth={1.5} />
                      {c.phone}
                    </span>
                  )}
                </div>
                {c.notes && (
                  <p className="text-xs text-muted-foreground italic mt-1.5">{c.notes}</p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[hsl(var(--gold-deep))]">
                    <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(c)}>Bewerken</DropdownMenuItem>
                  {c.role !== "primary" && (
                    <DropdownMenuItem onClick={() => handleAssign(c, "primary")}>
                      Maak primair
                    </DropdownMenuItem>
                  )}
                  {c.role !== "backup" && (
                    <DropdownMenuItem onClick={() => handleAssign(c, "backup")}>
                      Maak backup
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setDeleteCandidate(c)}
                    className="text-destructive focus:text-destructive"
                  >
                    Verwijderen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <ClientContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clientId={clientId}
        contact={editing}
      />

      <AlertDialog open={!!deleteCandidate} onOpenChange={(o) => !o && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contactpersoon verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate?.name} wordt definitief verwijderd. Deze actie is niet terug te draaien.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleBadge({ role }: { role: ClientContact["role"] }) {
  if (role === "primary") {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-[0.08em] border"
        style={{
          background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
          borderColor: "hsl(var(--gold-deep))",
          color: "hsl(var(--primary-foreground))",
        }}
      >
        {CLIENT_CONTACT_ROLE_LABELS.primary}
      </span>
    );
  }
  if (role === "backup") {
    return (
      <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px]">
        {CLIENT_CONTACT_ROLE_LABELS.backup}
      </span>
    );
  }
  return (
    <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px] !text-muted-foreground">
      {CLIENT_CONTACT_ROLE_LABELS.other}
    </span>
  );
}
