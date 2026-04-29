import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  Box,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crown,
  Ellipsis,
  FileText,
  History,
  Inbox,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Plus,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Truck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useTenantOptional } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_ACCESS, type OfficeRole } from "@/lib/roleAccess";
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

type UserRole = OfficeRole;

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
  admin: ROLE_ACCESS.admin.label,
  medewerker: ROLE_ACCESS.medewerker.label,
};

const configTabs = [
  { id: "profiel", label: "Profiel" },
  { id: "toegang", label: "Toegang" },
  { id: "activiteit", label: "Activiteit" },
  { id: "beveiliging", label: "Beveiliging" },
  { id: "instellingen", label: "Instellingen" },
] as const;

type AccessLevel = "full" | "limited" | "none";

const accessMatrix = [
  { module: "Orders", description: "Aanmaken, bekijken en beheren", icon: Box, viewer: "full", medewerker: "full", admin: "full" },
  { module: "Dispatch", description: "Planning en ritbeheer", icon: Truck, viewer: "none", medewerker: "full", admin: "full" },
  { module: "Inbox", description: "Berichten en meldingen", icon: Inbox, viewer: "full", medewerker: "full", admin: "full" },
  { module: "Klanten", description: "Klantgegevens beheren", icon: Users, viewer: "none", medewerker: "full", admin: "full" },
  { module: "Tarieven", description: "Tarieven en afspraken", icon: FileText, viewer: "none", medewerker: "limited", admin: "full" },
  { module: "Facturatie", description: "Facturen en creditnota's", icon: FileText, viewer: "none", medewerker: "limited", admin: "full" },
  { module: "Rapportages", description: "Overzichten en analytics", icon: BarChart3, viewer: "full", medewerker: "full", admin: "full" },
  { module: "Instellingen", description: "Systeeminstellingen", icon: Settings, viewer: "none", medewerker: "none", admin: "full" },
  { module: "Gebruikers", description: "Gebruikers en rollen beheren", icon: UserCog, viewer: "none", medewerker: "none", admin: "full" },
  { module: "Audit logs", description: "Activiteit en logs inzien", icon: History, viewer: "none", medewerker: "none", admin: "full" },
] satisfies Array<{
  module: string;
  description: string;
  icon: typeof Box;
  viewer: AccessLevel;
  medewerker: AccessLevel;
  admin: AccessLevel;
}>;

function getPrimaryRole(user: UserRow): UserRole {
  return user.roles.includes("admin") ? "admin" : "medewerker";
}

function AccessIndicator({ level }: { level: AccessLevel }) {
  if (level === "full") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (level === "limited") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
        <Clock3 className="h-3.5 w-3.5" />
      </span>
    );
  }

  return <span className="text-muted-foreground/50">-</span>;
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
  const [configSaved, setConfigSaved] = useState(false);
  const [configTab, setConfigTab] = useState<"profiel" | "toegang" | "activiteit" | "beveiliging" | "instellingen">("profiel");

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
      invalidateUsers();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Rol wijzigen mislukt"),
  });

  const updateProfile = useMutation({
    mutationFn: ({ userId, displayName }: { userId: string; displayName: string }) =>
      callAdminUsers("update_profile", { tenant_id: tenantId, user_id: userId, display_name: displayName.trim() || null }),
    onSuccess: () => {
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
    setConfigSaved(false);
    setConfigTab("toegang");
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
      setConfigSaved(true);
      return;
    }

    try {
      await Promise.all(tasks);
      toast.success("Wijzigingen opgeslagen");
      setSelectedUser((user) => user ? { ...user, display_name: nextName || null, roles: [configRole] } : user);
      setConfigSaved(true);
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
        <div className="p-5 border-b border-border/30 bg-gradient-to-b from-background to-muted/10">
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
              <Button type="button" variant="outline" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </Button>
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
                <tr className="border-b border-border/30 bg-muted/10">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Gebruiker</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Rol</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden lg:table-cell">Laatste login</th>
                  {isAdmin && (
                    <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Acties</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25">
                {filteredUsers.map((row, idx) => {
                  const primaryRole = getPrimaryRole(row);
                  const isCurrentUser = currentUser?.id === row.user_id;

                  return (
                    <motion.tr
                      key={row.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="hover:bg-amber-50/20 transition-colors duration-150"
                    >
                      <td className="px-5 py-5 min-w-[300px]">
                        <div className="flex items-center gap-3.5">
                          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-amber-100 to-stone-100 flex items-center justify-center text-xs font-semibold text-stone-800 shrink-0 shadow-sm ring-1 ring-black/5">
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
                      <td className="px-5 py-5 min-w-[160px]">
                        <Badge
                          variant="outline"
                          className={cn("text-xs px-2.5 py-1", roleStyles[primaryRole])}
                        >
                          {primaryRole === "admin" ? <Shield className="h-2.5 w-2.5 mr-1" /> : <UserCog className="h-2.5 w-2.5 mr-1" />}
                          {roleLabels[primaryRole]}
                        </Badge>
                      </td>
                      <td className="px-5 py-5 hidden md:table-cell">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Actief
                        </div>
                      </td>
                      <td className="px-5 py-5 hidden lg:table-cell">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>{formatDate(row.last_sign_in_at)}</span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openConfig(row)}
                            aria-label={`Configureren ${row.display_name || row.email || "gebruiker"}`}
                            className="h-8 w-8"
                          >
                            <Ellipsis className="h-4 w-4" />
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
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]">
          {selectedUser && (
            <form onSubmit={handleSaveConfig} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border/30 bg-background px-7 py-6">
                <div className="flex items-center gap-3 pr-8">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedUser(null)}
                    className="h-8 w-8 shrink-0"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <SheetHeader className="space-y-0 text-left">
                    <SheetTitle className="text-base">Gebruiker configureren</SheetTitle>
                    <SheetDescription className="sr-only">
                      Configureer profiel, rol, toegang en beheeracties voor deze gebruiker.
                    </SheetDescription>
                  </SheetHeader>
                </div>

                <div className="mt-6 flex items-center gap-4 rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/30">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-stone-100 text-lg font-semibold text-stone-800 shadow-sm ring-1 ring-black/5">
                    {(selectedUser.display_name || selectedUser.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-foreground">{selectedUser.display_name || "Onbekend"}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{roleLabels[getPrimaryRole(selectedUser)]} gebruiker</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-100">
                        Actief
                      </Badge>
                      <span>Laatste login: {formatDate(selectedUser.last_sign_in_at)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", roleStyles[getPrimaryRole(selectedUser)])}>
                    {roleLabels[getPrimaryRole(selectedUser)]}
                  </Badge>
                </div>

                <div className="mt-6 flex gap-6 border-b border-border/40">
                  {configTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setConfigTab(tab.id)}
                      className={cn(
                        "border-b-2 px-0 pb-3 text-sm transition-colors",
                        configTab === tab.id
                          ? "border-amber-600 text-amber-700"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {configSaved && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />
                    Wijzigingen opgeslagen
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-background to-muted/10 px-7 py-7">
                <div className="space-y-6">
                  {configTab === "profiel" && (
                    <section className="space-y-4 rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/30">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Profiel</h3>
                        <p className="text-xs text-muted-foreground">Deze naam wordt in overzichten en auditregels getoond.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="config-name">Weergavenaam</Label>
                        <Input
                          id="config-name"
                          value={configName}
                          onChange={(event) => {
                            setConfigName(event.target.value);
                            setConfigSaved(false);
                          }}
                          placeholder="Naam van de gebruiker"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="config-email">E-mail</Label>
                        <Input
                          id="config-email"
                          value={selectedUser.email ?? selectedUser.user_id}
                          readOnly
                          className="h-11 bg-muted/20"
                        />
                      </div>
                    </section>
                  )}

                  {configTab === "toegang" && (
                    <>
                      <section className="space-y-4 rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/30">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Toegangsrechten</h3>
                            <p className="text-xs text-muted-foreground">Bepaal tot welke modules en acties deze gebruiker toegang heeft.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="gap-2">
                            <UserCog className="h-3.5 w-3.5" />
                            Wijzig rol
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {(["medewerker", "admin"] as UserRole[]).map((role) => {
                            const access = ROLE_ACCESS[role];
                            const checked = configRole === role;
                            const locked = selectedUser.user_id === currentUser?.id && getPrimaryRole(selectedUser) === "admin" && role !== "admin";
                            const Icon = role === "admin" ? Crown : UserCog;

                            return (
                              <button
                                key={role}
                                type="button"
                                disabled={locked}
                                onClick={() => {
                                  setConfigRole(role);
                                  setConfigSaved(false);
                                }}
                                className={cn(
                                  "group rounded-lg p-4 text-left shadow-sm ring-1 transition-all",
                                  role === "admin"
                                    ? "bg-amber-50/60 ring-amber-200 hover:bg-amber-50"
                                    : "bg-background ring-border/30 hover:bg-muted/20",
                                  checked && (role === "admin" ? "ring-2 ring-amber-500" : "ring-2 ring-primary/35"),
                                  locked && "cursor-not-allowed opacity-50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
                                    role === "admin" ? "bg-white text-amber-700 ring-amber-200" : "bg-muted/20 text-foreground ring-border/50",
                                  )}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-foreground">{access.label}</p>
                                      {checked && <CheckCircle2 className={cn("h-4 w-4", role === "admin" ? "text-amber-700" : "text-primary")} />}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {role === "admin" ? "Volledige controle" : "Dagelijkse operaties"}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">{access.routeAccess}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      {configRole === "admin" && (
                        <section className="flex gap-3 rounded-lg bg-amber-50 p-5 text-amber-900 shadow-sm ring-1 ring-amber-100">
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <h3 className="text-sm font-semibold">Heeft impact op de hele organisatie</h3>
                            <p className="mt-1 text-sm leading-relaxed">
                              Deze rol heeft toegang tot gevoelige instellingen en kan wijzigingen aanbrengen die impact hebben op alle gegevens en processen.
                            </p>
                          </div>
                        </section>
                      )}

                      <section className="overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-border/30">
                        <div className="grid grid-cols-[minmax(210px,1.8fr)_repeat(3,minmax(72px,0.7fr))] border-b border-border/40 bg-muted/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <div>Module</div>
                          <div className="text-center">Viewer</div>
                          <div className="text-center">Medewerker</div>
                          <div className="text-center">Admin</div>
                        </div>
                        <div className="divide-y divide-border/30">
                          {accessMatrix.map((row) => {
                            const Icon = row.icon;
                            return (
                              <div
                                key={row.module}
                                className="grid grid-cols-[minmax(210px,1.8fr)_repeat(3,minmax(72px,0.7fr))] items-center px-4 py-3"
                              >
                                <div className="flex items-center gap-3">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{row.module}</p>
                                    <p className="text-xs text-muted-foreground">{row.description}</p>
                                  </div>
                                </div>
                                <div className="flex justify-center"><AccessIndicator level={row.viewer} /></div>
                                <div className={cn("flex justify-center rounded-md py-1", configRole === "medewerker" && "bg-primary/5")}>
                                  <AccessIndicator level={row.medewerker} />
                                </div>
                                <div className={cn("flex justify-center rounded-md py-1", configRole === "admin" && "bg-amber-50")}>
                                  <AccessIndicator level={row.admin} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="flex flex-wrap gap-5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <AccessIndicator level="full" />
                          Toegang
                        </div>
                        <div className="flex items-center gap-2">
                          <AccessIndicator level="limited" />
                          Beperkte toegang
                        </div>
                        <div className="flex items-center gap-2">
                          <AccessIndicator level="none" />
                          Geen toegang
                        </div>
                      </section>
                    </>
                  )}

                  {configTab === "activiteit" && (
                    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-background p-4 shadow-sm ring-1 ring-border/30">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide">Geregistreerd</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(selectedUser.created_at)}</p>
                      </div>
                      <div className="rounded-lg bg-background p-4 shadow-sm ring-1 ring-border/30">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock3 className="h-4 w-4" />
                          <p className="text-[11px] font-semibold uppercase tracking-wide">Laatste login</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(selectedUser.last_sign_in_at)}</p>
                      </div>
                    </section>
                  )}

                  {configTab === "beveiliging" && (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Snelle acties</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 justify-start gap-3 rounded-lg bg-background shadow-sm"
                          onClick={() => toast.info("Wachtwoord resetten is nog niet gekoppeld")}
                        >
                          <KeyRound className="h-4 w-4" />
                          Wachtwoord resetten
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 justify-start gap-3 rounded-lg bg-background shadow-sm"
                          onClick={() => toast.info("Deactiveren is nog niet gekoppeld")}
                        >
                          <UserX className="h-4 w-4" />
                          Gebruiker deactiveren
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 justify-start gap-3 rounded-lg bg-background shadow-sm sm:col-span-1"
                          onClick={() => toast.info("Login geschiedenis is nog niet gekoppeld")}
                        >
                          <History className="h-4 w-4" />
                          Login geschiedenis
                        </Button>
                      </div>
                    </section>
                  )}

                  {configTab === "instellingen" && (
                    <section className="rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/30">
                      <h3 className="text-sm font-semibold text-foreground">Instellingen</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Gebruikersinstellingen worden beheerd via het vaste rechtenprofiel.</p>
                    </section>
                  )}
                </div>
              </div>

              <SheetFooter className="border-t border-border/30 bg-background px-7 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setSelectedUser(null)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={updateProfile.isPending || updateRole.isPending} className="gap-2 bg-stone-950 text-white hover:bg-stone-800">
                  {(updateProfile.isPending || updateRole.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Wijzigingen opslaan
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
