import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
    } catch (err: unknown) {
      toast.error("Uitnodiging mislukt", { description: err instanceof Error ? err.message : "Onbekende fout" });
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
    <div className="space-y-6">
      {/* Portal status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-gray-400" />
                Klantportaal
              </CardTitle>
              <CardDescription>
                Beheer portaaltoegang voor {clientName}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={portalEnabled}
                onCheckedChange={setPortalEnabled}
              />
              <Label className="text-sm">{portalEnabled ? "Actief" : "Inactief"}</Label>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Invite user */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gebruiker uitnodigen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@bedrijf.nl"
              type="email"
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as PortalRole)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PORTAL_ROLE_LABELS) as [PortalRole, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleInvite}
              disabled={inviteUser.isPending || !inviteEmail.includes("@")}
              className="gap-1.5"
            >
              {inviteUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Uitnodigen
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            De gebruiker ontvangt een magic link per e-mail om in te loggen op het klantportaal.
          </p>
        </CardContent>
      </Card>

      {/* Existing users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            Portaalgebruikers ({portalUsers?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : !portalUsers || portalUsers.length === 0 ? (
            <p className="text-sm text-gray-400">Nog geen portaalgebruikers uitgenodigd.</p>
          ) : (
            <div className="space-y-2">
              {portalUsers.map((u) => (
                <div
                  key={u.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    u.is_active ? "border-gray-100" : "border-gray-100 bg-gray-50 opacity-60"
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {u.display_name ?? u.email ?? u.user_id}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          u.is_active
                            ? "border-emerald-200 text-emerald-700"
                            : "border-gray-200 text-gray-500"
                        )}
                      >
                        {u.is_active ? "Actief" : "Inactief"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Rol: {PORTAL_ROLE_LABELS[u.portal_role]}
                      {" | "}Uitgenodigd: {new Date(u.invited_at).toLocaleDateString("nl-NL")}
                      {" | "}Laatst ingelogd: {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString("nl-NL")
                        : "Nooit"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeactivate(u)}
                      className="h-8 text-xs"
                    >
                      {u.is_active ? "Deactiveer" : "Activeer"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(u.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
