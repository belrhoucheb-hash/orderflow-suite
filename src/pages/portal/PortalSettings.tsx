import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, MapPin, Plus, Loader2, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCurrentPortalUser,
  useClientPortalUsers,
  useInvitePortalUser,
  useUpdatePortalUser,
  useDeletePortalUser,
} from "@/hooks/useClientPortalUsers";
import { PORTAL_ROLE_LABELS } from "@/types/clientPortal";
import type { PortalRole } from "@/types/clientPortal";
import { ApiTokenSettings } from "@/components/settings/ApiTokenSettings";

export default function PortalSettings() {
  const { data: portalUser } = useCurrentPortalUser();
  const { data: allUsers, isLoading: usersLoading } = useClientPortalUsers(portalUser?.client_id ?? null);
  const inviteUser = useInvitePortalUser();
  const updateUser = useUpdatePortalUser();
  const deleteUser = useDeletePortalUser();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PortalRole>("viewer");

  const isAdmin = portalUser?.portal_role === "admin";

  // Client locations
  const [locations, setLocations] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLocationsLoading(true);
      const { data } = await supabase
        .from("client_locations" as any)
        .select("*")
        .eq("client_id", portalUser.client_id)
        .order("name", { ascending: true });
      setLocations(data ?? []);
      setLocationsLoading(false);
    };

    load();
  }, [portalUser?.client_id]);

  const handleInvite = async () => {
    if (!portalUser || !inviteEmail.includes("@")) return;

    try {
      await inviteUser.mutateAsync({
        email: inviteEmail.trim(),
        client_id: portalUser.client_id,
        tenant_id: portalUser.tenant_id,
        portal_role: inviteRole,
      });
      toast.success("Uitnodiging verstuurd", {
        description: `${inviteEmail} ontvangt een inloglink per e-mail.`,
      });
      setInviteEmail("");
    } catch (err: any) {
      toast.error("Uitnodiging mislukt", { description: err.message });
    }
  };

  const handleRoleChange = async (userId: string, newRole: PortalRole) => {
    try {
      await updateUser.mutateAsync({ id: userId, updates: { portal_role: newRole } });
      toast.success("Rol bijgewerkt");
    } catch {
      toast.error("Fout bij bijwerken rol");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await deleteUser.mutateAsync(userId);
      toast.success("Gebruiker verwijderd");
    } catch {
      toast.error("Fout bij verwijderen");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instellingen</h1>
        <p className="text-gray-500 mt-1">Beheer uw portaalinstellingen</p>
      </div>

      {/* Users management — only for portal admins */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              Gebruikers
            </CardTitle>
            <CardDescription>Beheer wie toegang heeft tot dit portaal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invite form */}
            <div className="flex gap-3">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@bedrijf.nl"
                type="email"
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as PortalRole)}>
                <SelectTrigger className="w-40">
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

            {/* User list */}
            {usersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {(allUsers ?? []).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.display_name ?? u.email ?? u.user_id}
                      </p>
                      <p className="text-xs text-gray-500">
                        Laatst ingelogd: {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleDateString("nl-NL")
                          : "Nooit"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={u.portal_role}
                        onValueChange={(v) => handleRoleChange(u.id, v as PortalRole)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PORTAL_ROLE_LABELS) as [PortalRole, string][]).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {u.user_id !== portalUser?.user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUser(u.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* API-tokens , admin-only in het portaal */}
      {isAdmin && portalUser?.client_id && (
        <Card>
          <CardContent className="pt-6">
            <ApiTokenSettings
              clientId={portalUser.client_id}
              hideTenantOnlyScopes={true}
              title="API-tokens"
              subtitle="Geef je eigen systemen toegang tot jullie data in OrderFlow via de REST API."
            />
          </CardContent>
        </Card>
      )}

      {/* Locations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-400" />
            Locaties
          </CardTitle>
          <CardDescription>Uw opgeslagen adressen voor sneller bestellen</CardDescription>
        </CardHeader>
        <CardContent>
          {locationsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-400">Nog geen locaties opgeslagen.</p>
          ) : (
            <div className="space-y-2">
              {locations.map((loc: any) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100"
                >
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{loc.label ?? loc.name}</p>
                    <p className="text-xs text-gray-500 truncate">{loc.address}</p>
                    {loc.time_window_start && loc.time_window_end && (
                      <p className="text-xs text-gray-400">
                        Tijdvenster: {loc.time_window_start} - {loc.time_window_end}
                      </p>
                    )}
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
