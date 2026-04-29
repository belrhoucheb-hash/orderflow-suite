import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Mail, Plus, Search, Shield, ShieldCheck, UserCog, Users } from "lucide-react";
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

function getPrimaryRole(user: UserRow): UserRole {
  return user.roles.includes("admin") ? "admin" : "medewerker";
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
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

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
    if (!term) return users;
    return users.filter((u) =>
      [u.display_name, u.email, u.user_id, ...u.roles]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [searchTerm, users]);

  const adminCount = users.filter((u) => u.roles.includes("admin")).length;
  const medewerkerCount = users.filter((u) => getPrimaryRole(u) === "medewerker").length;

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Vul een e-mailadres in");
      return;
    }
    inviteUser.mutate();
  };

  const handleNameBlur = (row: UserRow) => {
    const nextName = editingNames[row.user_id] ?? row.display_name ?? "";
    if (nextName.trim() === (row.display_name ?? "").trim()) return;
    updateProfile.mutate({ userId: row.user_id, displayName: nextName });
  };

  if (isLoading) {
    return <LoadingState message="Gebruikers laden..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gebruikers"
        subtitle={`${users.length} gebruiker${users.length !== 1 ? "s" : ""} geregistreerd`}
        actions={isAdmin ? (
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Uitnodigen
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Totaal", value: users.length, icon: Users, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Admins", value: adminCount, icon: ShieldCheck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Medewerkers", value: medewerkerCount, icon: UserCog, color: "text-emerald-600", bg: "bg-emerald-500/8" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-card rounded-lg border border-border/40 p-3.5 flex items-center gap-3"
          >
            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div>
              <p className="text-lg font-semibold font-display tabular-nums leading-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border/40 overflow-hidden">
        <div className="p-3 border-b border-border/30">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Zoek op naam, e-mail of rol"
              className="pl-9"
            />
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
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Gebruiker</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Rol</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden lg:table-cell">Laatste login</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:table-cell">Geregistreerd</th>
                  {isAdmin && (
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Acties</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredUsers.map((row, idx) => {
                  const primaryRole = getPrimaryRole(row);
                  const isCurrentUser = currentUser?.id === row.user_id;
                  const isChangingRole = updateRole.isPending && updateRole.variables?.userId === row.user_id;
                  const isSavingName = updateProfile.isPending && updateProfile.variables?.userId === row.user_id;
                  const displayValue = editingNames[row.user_id] ?? row.display_name ?? "";

                  return (
                    <motion.tr
                      key={row.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="hover:bg-muted/20 transition-colors duration-100"
                    >
                      <td className="px-4 py-3 min-w-[260px]">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-xs font-semibold text-white shrink-0">
                            {(row.display_name || row.email || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              {isAdmin ? (
                                <Input
                                  value={displayValue}
                                  onChange={(event) => setEditingNames((prev) => ({ ...prev, [row.user_id]: event.target.value }))}
                                  onBlur={() => handleNameBlur(row)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                  disabled={isSavingName}
                                  placeholder="Naam"
                                  className="h-8 max-w-[220px]"
                                  aria-label={`Naam voor ${row.email ?? row.user_id}`}
                                />
                              ) : (
                                <p className="text-sm font-medium text-foreground truncate">{row.display_name || "Onbekend"}</p>
                              )}
                              {isSavingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              {isCurrentUser && <Badge variant="secondary" className="text-[10px] px-1.5">Jij</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{row.email ?? `${row.user_id.slice(0, 8)}...`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn("text-xs px-2 py-0.5", roleStyles[primaryRole])}
                        >
                          {primaryRole === "admin" && <Shield className="h-2.5 w-2.5 mr-1" />}
                          {roleLabels[primaryRole]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {row.last_sign_in_at
                            ? new Date(row.last_sign_in_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
                            : "Nog niet"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <Select
                            value={primaryRole}
                            onValueChange={(role) => updateRole.mutate({ userId: row.user_id, role: role as UserRole })}
                            disabled={isChangingRole || (isCurrentUser && primaryRole === "admin")}
                          >
                            <SelectTrigger className="h-8 w-[145px] text-sm">
                              {isChangingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="medewerker">Medewerker</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
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
    </div>
  );
};

export default UsersPage;
