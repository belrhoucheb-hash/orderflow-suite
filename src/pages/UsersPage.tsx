import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, Clock3, Loader2, Mail, Plus, Search, Settings2, Shield, UserCog, Users } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useTenantOptional } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type UserRole = "admin" | "medewerker";

interface UserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  email: string | null;
  last_sign_in_at: string | null;
  roles: UserRole[];
}

interface AdminUsersResponse {
  users?: UserRow[];
  user?: UserRow;
  error?: string;
}

const roleStyles: Record<UserRole, string> = {
  admin: "bg-primary/10 text-primary border-primary/20",
  medewerker: "bg-blue-500/8 text-blue-700 border-blue-200/60",
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  medewerker: "Medewerker",
};

const roleDescriptions: Record<UserRole, string> = {
  admin: "Volledige toegang tot beheer, instellingen en operationele workflows.",
  medewerker: "Toegang tot dagelijkse planning en uitvoering zonder beheerrechten.",
};

function getPrimaryRole(user: UserRow): UserRole {
  return user.roles.includes("admin") ? "admin" : "medewerker";
}

function formatDate(value: string | null) {
  if (!value) return "Nog niet";
  return new Date(value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

async function callAdminUsers(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke<AdminUsersResponse>("admin-users", {
    body: { action, ...payload },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

function useUsers(tenantId?: string | null) {
  return useQuery({
    queryKey: ["users-admin", tenantId],
    queryFn: async () => {
      const data = await callAdminUsers("list", { tenant_id: tenantId });
      return data.users ?? [];
    },
  });
}

const UsersPage = () => {
  const queryClient = useQueryClient();
  const { isAdmin, user: currentUser } = useAuth();
  const { tenant } = useTenantOptional();
  const tenantId = tenant?.id ?? null;
  const { data: users = [], isLoading } = useUsers(tenantId);
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("medewerker");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [configName, setConfigName] = useState("");
  const [configRole, setConfigRole] = useState<UserRole>("medewerker");

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["users-admin"] });

  const inviteUser = useMutation({
    mutationFn: () => callAdminUsers("invite", {
      tenant_id: tenantId,
      email: inviteEmail.trim(),
      display_name: inviteName.trim() || null,
      role: inviteRole,
      redirect_to: `${window.location.origin}/login`,
    }),
    onSuccess: () => {
      toast.success("Uitnodiging verstuurd");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("medewerker");
      invalidateUsers();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Uitnodigen mislukt"),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      callAdminUsers("update_role", { tenant_id: tenantId, user_id: userId, role }),
    onSuccess: () => {
      toast.success("Rol bijgewerkt");
      invalidateUsers();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Rol wijzigen mislukt"),
  });

  const updateProfile = useMutation({
    mutationFn: ({ userId, displayName }: { userId: string; displayName: string }) =>
      callAdminUsers("update_profile", { tenant_id: tenantId, user_id: userId, display_name: displayName.trim() || null }),
    onSuccess: () => {
      toast.success("Naam bijgewerkt");
      invalidateUsers();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Naam wijzigen mislukt"),
  });

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) =>
      (roleFilter === "all" || getPrimaryRole(u) === roleFilter) &&
      (!term ||
        [u.display_name, u.email, u.user_id, ...u.roles]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))),
    );
  }, [roleFilter, searchTerm, users]);

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Vul een e-mailadres in");
      return;
    }
    inviteUser.mutate();
  };

  const openConfig = (row: UserRow) => {
    setSelectedUser(row);
    setConfigName(row.display_name ?? "");
    setConfigRole(getPrimaryRole(row));
  };

  const handleSaveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;

    const currentRole = getPrimaryRole(selectedUser);
    const nextName = configName.trim();
    const tasks: Promise<unknown>[] = [];

    if (nextName !== (selectedUser.display_name ?? "").trim()) {
      tasks.push(updateProfile.mutateAsync({ userId: selectedUser.user_id, displayName: nextName }));
    }
    if (configRole !== currentRole) {
      tasks.push(updateRole.mutateAsync({ userId: selectedUser.user_id, role: configRole }));
    }

    if (tasks.length === 0) {
      setSelectedUser(null);
      return;
    }

    try {
      await Promise.all(tasks);
      toast.success("Gebruiker bijgewerkt");
      setSelectedUser(null);
    } catch {
      // Mutation handlers already show a concrete error.
    }
  };

  if (isLoading) {
    return <LoadingState message="Gebruikers laden..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gebruikers"
        subtitle="Beheer toegang, rollen en profielgegevens voor kantooraccounts."
        actions={isAdmin ? (
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Uitnodigen
          </Button>
        ) : undefined}
      />

      <div className="bg-card rounded-lg shadow-sm border border-border/40 overflow-hidden">
        <div className="p-4 border-b border-border/30 bg-muted/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Gebruikersbeheer</p>
              <p className="text-xs text-muted-foreground">{users.length} accounts binnen deze omgeving</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Zoek op naam, e-mail of rol"
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | UserRole)}>
                <SelectTrigger className="sm:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle rollen</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="medewerker">Medewerkers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={users.length === 0 ? "Geen gebruikers gevonden" : "Geen resultaten"}
            description={users.length === 0 ? "Nodig de eerste gebruiker uit om toegang te geven." : "Pas je zoekterm aan om gebruikers te tonen."}
            className="py-16"
            action={isAdmin && users.length === 0 ? (
              <Button onClick={() => setInviteOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Uitnodigen
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Gebruiker</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Toegang</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden lg:table-cell">Laatste login</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:table-cell">Sinds</th>
                  {isAdmin && (
                    <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Beheer</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredUsers.map((row, idx) => {
                  const primaryRole = getPrimaryRole(row);
                  const isCurrentUser = currentUser?.id === row.user_id;

                  return (
                    <motion.tr
                      key={row.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="hover:bg-muted/20 transition-colors duration-150"
                    >
                      <td className="px-5 py-4 min-w-[300px]">
                        <div className="flex items-center gap-3.5">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-sm">
                            {(row.display_name || row.email || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{row.display_name || "Onbekend"}</p>
                              {isCurrentUser && <Badge variant="secondary" className="text-[10px] px-1.5">Jij</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{row.email ?? `${row.user_id.slice(0, 8)}...`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[220px]">
                        <div className="space-y-1.5">
                          <Badge
                            variant="outline"
                            className={cn("text-xs px-2 py-0.5", roleStyles[primaryRole])}
                          >
                            {primaryRole === "admin" ? <Shield className="h-2.5 w-2.5 mr-1" /> : <UserCog className="h-2.5 w-2.5 mr-1" />}
                            {roleLabels[primaryRole]}
                          </Badge>
                          <p className="text-xs text-muted-foreground max-w-[260px]">{roleDescriptions[primaryRole]}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>{formatDate(row.last_sign_in_at)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>{formatDate(row.created_at)}</span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openConfig(row)}
                            className="gap-2"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Configureren
                          </Button>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 bg-muted/10">
          <p className="text-xs text-muted-foreground">
            {filteredUsers.length} van {users.length} gebruiker{users.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gebruiker uitnodigen</DialogTitle>
            <DialogDescription>
              Verstuur een uitnodiging en geef meteen het juiste toegangsniveau.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Naam</Label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="Bijv. Sam de Vries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="sam@bedrijf.nl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medewerker">Medewerker</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={inviteUser.isPending} className="gap-2">
                {inviteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Versturen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Gebruiker configureren</SheetTitle>
            <SheetDescription>
              Pas profiel en toegangsniveau aan voor dit kantooraccount.
            </SheetDescription>
          </SheetHeader>

          {selectedUser && (
            <form onSubmit={handleSaveConfig} className="mt-6 space-y-6">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-sm font-semibold text-white shadow-sm">
                    {(selectedUser.display_name || selectedUser.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedUser.display_name || "Onbekend"}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedUser.email ?? selectedUser.user_id}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="config-name">Weergavenaam</Label>
                <Input
                  id="config-name"
                  value={configName}
                  onChange={(event) => setConfigName(event.target.value)}
                  placeholder="Naam van de gebruiker"
                />
              </div>

              <div className="space-y-2">
                <Label>Rol en toegang</Label>
                <Select
                  value={configRole}
                  onValueChange={(value) => setConfigRole(value as UserRole)}
                  disabled={selectedUser.user_id === currentUser?.id && getPrimaryRole(selectedUser) === "admin"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medewerker">Medewerker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{roleDescriptions[configRole]}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Geregistreerd</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedUser.created_at)}</p>
                </div>
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Laatste login</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedUser.last_sign_in_at)}</p>
                </div>
              </div>

              <SheetFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedUser(null)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={updateProfile.isPending || updateRole.isPending} className="gap-2">
                  {(updateProfile.isPending || updateRole.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Opslaan
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default UsersPage;
