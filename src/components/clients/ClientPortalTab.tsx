import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Loader2, Trash2, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useClientPortalUsers,
  useInvitePortalUser,
  useUpdatePortalUser,
  useDeletePortalUser,
} from "@/hooks/useClientPortalUsers";
import { PORTAL_ROLE_LABELS } from "@/types/clientPortal";
import type { PortalRole, ClientPortalUser } from "@/types/clientPortal";
import { useTenant } from "@/contexts/TenantContext";

interface ClientPortalTabProps {
  clientId: string;
  clientName: string;
}

export function ClientPortalTab({ clientId, clientName }: ClientPortalTabProps) {
  const { tenant } = useTenant();
  const { data: portalUsers, isLoading } = useClientPortalUsers(clientId);
  const inviteUser = useInvitePortalUser();
  const updateUser = useUpdatePortalUser();
  const deleteUser = useDeletePortalUser();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PortalRole>("viewer");
  const [portalEnabled, setPortalEnabled] = useState(true);

  const handleInvite = async () => {
    if (!inviteEmail.includes("@") || !tenant?.id) return;

    try {
      await inviteUser.mutateAsync({
        email: inviteEmail.trim(),
        client_id: clientId,
        tenant_id: tenant.id,
        portal_role: inviteRole,
      });
      toast.success("Uitnodiging verstuurd naar " + inviteEmail);
      setInviteEmail("");
    } catch (err: any) {
      toast.error("Uitnodiging mislukt", { description: err.message });
    }
  };

  const handleDeactivate = async (user: ClientPortalUser) => {
    try {
      await updateUser.mutateAsync({
        id: user.id,
        updates: { is_active: !user.is_active },
      });
      toast.success(user.is_active ? "Gebruiker gedeactiveerd" : "Gebruiker geactiveerd");
    } catch {
      toast.error("Fout bij status wijzigen");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id);
      toast.success("Portaalgebruiker verwijderd");
    } catch {
      toast.error("Fout bij verwijderen");
    }
  };

  return (
    <div className="space-y-5">
      <div className="card--luxe p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Globe className="h-4 w-4 text-[hsl(var(--gold-deep))] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Klantportaal</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Beheer portaaltoegang voor {clientName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={portalEnabled}
              onCheckedChange={setPortalEnabled}
            />
            <span className="text-xs text-muted-foreground">{portalEnabled ? "Actief" : "Inactief"}</span>
          </div>
        </div>
      </div>

      <div className="card--luxe p-4 space-y-3">
        <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">
          Gebruiker uitnodigen
        </h3>
        <div className="flex flex-wrap gap-2">
          <Input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@bedrijf.nl"
            type="email"
            className="field-luxe flex-1 min-w-[12rem]"
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as PortalRole)}>
            <SelectTrigger className="btn-luxe !h-[2.625rem] w-36 justify-between">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PORTAL_ROLE_LABELS) as [PortalRole, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviteUser.isPending || !inviteEmail.includes("@")}
            className="btn-luxe btn-luxe--primary !h-[2.625rem]"
          >
            {inviteUser.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Uitnodigen
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          De gebruiker ontvangt een magic link per e-mail om in te loggen op het klantportaal.
        </p>
      </div>

      <div className="card--luxe p-4 space-y-3">
        <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em] flex items-center gap-2">
          <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
          Portaalgebruikers ({portalUsers?.length ?? 0})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold-deep))]" />
          </div>
        ) : !portalUsers || portalUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nog geen portaalgebruikers uitgenodigd.</p>
        ) : (
          <div className="space-y-2">
            {portalUsers.map((u) => (
              <div
                key={u.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.2)] gap-3",
                  !u.is_active && "opacity-60",
                )}
                style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.display_name ?? u.email ?? u.user_id}
                    </p>
                    <span
                      className={cn(
                        "callout--luxe__tag !py-0.5 !px-2 !text-[10px]",
                        !u.is_active && "!text-muted-foreground",
                      )}
                    >
                      {u.is_active ? "Actief" : "Inactief"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rol: {PORTAL_ROLE_LABELS[u.portal_role]}
                    {" · "}Uitgenodigd: {new Date(u.invited_at).toLocaleDateString("nl-NL")}
                    {" · "}Laatst ingelogd: {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString("nl-NL")
                      : "nooit"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(u)}
                    className="h-8 text-xs text-muted-foreground hover:text-[hsl(var(--gold-deep))]"
                  >
                    {u.is_active ? "Deactiveer" : "Activeer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(u.id)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
