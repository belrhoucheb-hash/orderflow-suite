import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  FileText,
  History,
  Inbox,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Monitor,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
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
import {
  getAccessActions,
  limitedActionsByModule,
  type OfficeAccessAction as AccessAction,
  type OfficeAccessActions as AccessActions,
  type OfficeAccessLevel as AccessLevel,
} from "@/lib/officeAccess";
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

type UserRole = OfficeRole;

interface UserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  email: string | null;
  last_sign_in_at: string | null;
  banned_until?: string | null;
  roles: UserRole[];
}

interface UserActivityRow {
  id: string;
  user_id: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

interface UserSecuritySettings {
  extra_security_enabled: boolean;
  verification_method: "authenticator_app" | "email";
  login_protection_enabled: boolean;
  max_login_attempts: number;
  lockout_minutes: number;
  password_reset_required: boolean;
  password_reset_sent_at: string | null;
  sessions_revoked_at: string | null;
  updated_at: string | null;
}

interface UserApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface UserAccessOverrideRow {
  module: string;
  access_level: AccessLevel;
  actions: AccessActions;
  updated_at: string | null;
}

interface UserSessionRow {
  session_key: string;
  browser: string | null;
  platform: string | null;
  user_agent: string | null;
  ip_label: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

interface AdminUsersResponse {
  users?: UserRow[];
  user?: UserRow;
  activity?: UserActivityRow[];
  security?: UserSecuritySettings;
  api_tokens?: UserApiTokenRow[];
  access_overrides?: UserAccessOverrideRow[];
  sessions?: UserSessionRow[];
  error?: string;
}

const roleStyles: Record<UserRole, string> = {
  admin: "bg-[hsl(var(--gold-soft)/0.78)] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.24)]",
  medewerker: "bg-muted/50 text-muted-foreground border-border/60",
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

type ActivityFilter = "all" | "login" | "roles" | "access" | "profile" | "invites";
type UserStatusFilter = "all" | "active" | "inactive";

const defaultSecuritySettings: UserSecuritySettings = {
  extra_security_enabled: false,
  verification_method: "authenticator_app",
  login_protection_enabled: true,
  max_login_attempts: 5,
  lockout_minutes: 15,
  password_reset_required: false,
  password_reset_sent_at: null,
  sessions_revoked_at: null,
  updated_at: null,
};

const accessMatrix = [
  { module: "Orders", description: "Aanmaken, bekijken en beheren", icon: Box, medewerker: "full", admin: "full" },
  { module: "Dispatch", description: "Planning en ritbeheer", icon: Truck, medewerker: "full", admin: "full" },
  { module: "Inbox", description: "Berichten en meldingen", icon: Inbox, medewerker: "full", admin: "full" },
  { module: "Klanten", description: "Klantgegevens beheren", icon: Users, medewerker: "full", admin: "full" },
  { module: "Tarieven", description: "Tarieven en afspraken", icon: FileText, medewerker: "limited", admin: "full" },
  { module: "Facturatie", description: "Facturen en creditnota's", icon: FileText, medewerker: "limited", admin: "full" },
  { module: "Rapportages", description: "Overzichten en analytics", icon: BarChart3, medewerker: "full", admin: "full" },
  { module: "Instellingen", description: "Systeeminstellingen", icon: Settings, medewerker: "none", admin: "full" },
  { module: "Gebruikers", description: "Gebruikers en rollen beheren", icon: UserCog, medewerker: "none", admin: "full" },
  { module: "Audit logs", description: "Activiteit en logs inzien", icon: History, medewerker: "none", admin: "full" },
] satisfies Array<{
  module: string;
  description: string;
  icon: typeof Box;
  medewerker: AccessLevel;
  admin: AccessLevel;
}>;

const actionLabels: Record<AccessAction, string> = {
  view: "Bekijken",
  create: "Aanmaken",
  edit: "Bewerken",
  delete: "Verwijderen",
};

const activityFilterLabels: Record<ActivityFilter, string> = {
  all: "Alle activiteit",
  login: "Logins",
  roles: "Rolwijzigingen",
  access: "Toegangsrechten",
  profile: "Profiel",
  invites: "Uitnodigingen",
};

function getPrimaryRole(user: UserRow): UserRole {
  return user.roles.includes("admin") ? "admin" : "medewerker";
}

function isUserActive(user: UserRow) {
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) return false;
  return Boolean(user.last_sign_in_at);
}

function AccessIndicator({ level }: { level: AccessLevel }) {
  if (level === "full") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/60">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (level === "limited") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.22)]">
        <Clock3 className="h-3.5 w-3.5" />
      </span>
    );
  }

  return <span className="text-muted-foreground/50">-</span>;
}

function accessLabel(level: AccessLevel) {
  if (level === "full") return "Volledig";
  if (level === "limited") return "Beperkt";
  return "Geen";
}

function AccessStatus({ level, overridden }: { level: AccessLevel; overridden: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
      !overridden && "bg-muted/50 text-muted-foreground ring-border/60",
      level === "full" && overridden && "bg-muted/50 text-muted-foreground ring-border/60",
      level === "limited" && overridden && "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.22)]",
      level === "none" && overridden && "bg-muted/40 text-muted-foreground ring-border/50",
    )}>
      {overridden && level !== "none" && <AccessIndicator level={level} />}
      {accessLabel(level)}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Nog niet";
  return new Date(value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? "Vandaag" : date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function activityPresentation(event: UserActivityRow): {
  title: string;
  description: string;
  icon: typeof UserCog;
  tone: "success" | "warning" | "neutral";
} {
  const changes = event.changes ?? {};
  const stringValue = (key: string) => typeof changes[key] === "string" ? changes[key] as string : "";

  if (event.action === "user.login") {
    return {
      title: "Login",
      description: stringValue("description") || "Succesvolle login geregistreerd",
      icon: UserCog,
      tone: "success",
    };
  }

  if (event.action === "user.invited") {
    return {
      title: "Gebruiker uitgenodigd",
      description: `Uitnodiging verstuurd naar ${stringValue("email") || "gebruiker"}`,
      icon: UserCog,
      tone: "neutral",
    };
  }

  if (event.action === "user.role_updated") {
    return {
      title: "Rol gewijzigd",
      description: `Rol gewijzigd van ${stringValue("from") || "onbekend"} naar ${stringValue("to") || "onbekend"}`,
      icon: Crown,
      tone: "warning",
    };
  }

  if (event.action === "user.profile_updated") {
    return {
      title: "Profiel gewijzigd",
      description: "Weergavenaam aangepast",
      icon: UserCog,
      tone: "neutral",
    };
  }

  if (event.action === "user.access_updated") {
    const count = typeof changes.override_count === "number" ? changes.override_count : 0;
    return {
      title: "Toegangsrechten aangepast",
      description: count > 0 ? `Toegang gewijzigd voor ${count} module${count === 1 ? "" : "s"}` : "Toegangsrechten teruggezet naar rolstandaard",
      icon: Shield,
      tone: "warning",
    };
  }

  if (event.action === "user.security_updated") {
    return {
      title: "Beveiliging aangepast",
      description: "Beveiligingsinstellingen zijn bijgewerkt",
      icon: ShieldCheck,
      tone: "warning",
    };
  }

  if (event.action === "user.sessions_revoked") {
    return {
      title: "Sessies vernieuwd",
      description: "Actieve sessies zijn gemarkeerd voor hercontrole",
      icon: Monitor,
      tone: "warning",
    };
  }

  if (event.action === "user.password_reset_sent") {
    return {
      title: "Wachtwoord reset verstuurd",
      description: `Resetlink verstuurd naar ${stringValue("email") || "gebruiker"}`,
      icon: KeyRound,
      tone: "neutral",
    };
  }

  if (event.action === "user.deactivated") {
    return {
      title: "Gebruiker gedeactiveerd",
      description: "Accounttoegang is ingetrokken",
      icon: UserX,
      tone: "warning",
    };
  }

  return {
    title: "Activiteit",
    description: stringValue("description") || "Gebruikersactie geregistreerd",
    icon: History,
    tone: "neutral",
  };
}

function matchesActivityFilter(event: UserActivityRow, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "login") return event.action === "user.login";
  if (filter === "roles") return event.action === "user.role_updated";
  if (filter === "access") return event.action === "user.access_updated";
  if (filter === "profile") return event.action === "user.profile_updated";
  if (filter === "invites") return event.action === "user.invited";
  return true;
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
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const data = await callAdminUsers("list", { tenant_id: tenantId });
      return data.users ?? [];
    },
  });
}

function useUserActivity(tenantId?: string | null, userId?: string | null) {
  return useQuery({
    queryKey: ["users-admin-activity", tenantId, userId],
    enabled: !!tenantId && !!userId,
    queryFn: async () => {
      const data = await callAdminUsers("list_activity", { tenant_id: tenantId, user_id: userId });
      return data.activity ?? [];
    },
  });
}

function useUserSecurity(tenantId?: string | null, userId?: string | null) {
  return useQuery({
    queryKey: ["users-admin-security", tenantId, userId],
    enabled: !!tenantId && !!userId,
    queryFn: async () => {
      const data = await callAdminUsers("get_security", { tenant_id: tenantId, user_id: userId });
      return {
        security: data.security ?? defaultSecuritySettings,
        apiTokens: data.api_tokens ?? [],
        accessOverrides: data.access_overrides ?? [],
        sessions: data.sessions ?? [],
      };
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
  const [userFiltersOpen, setUserFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [configName, setConfigName] = useState("");
  const [configRole, setConfigRole] = useState<UserRole>("medewerker");
  const [configSaved, setConfigSaved] = useState(false);
  const [configTab, setConfigTab] = useState<"profiel" | "toegang" | "activiteit" | "beveiliging" | "instellingen">("profiel");
  const [profileEditing, setProfileEditing] = useState(false);
  const [expandedAccessModule, setExpandedAccessModule] = useState<string | null>(null);
  const [accessOverrides, setAccessOverrides] = useState<Record<string, AccessLevel>>({});
  const [advancedLimitedModules, setAdvancedLimitedModules] = useState<Record<string, boolean>>({});
  const [customLimitedActions, setCustomLimitedActions] = useState<Record<string, AccessActions>>({});
  const [activityFiltersOpen, setActivityFiltersOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const { data: userActivity = [], isLoading: activityLoading } = useUserActivity(tenantId, selectedUser?.user_id);
  const { data: securityData, isLoading: securityLoading } = useUserSecurity(tenantId, selectedUser?.user_id);
  const securitySettings = securityData?.security ?? defaultSecuritySettings;
  const userApiTokens = securityData?.apiTokens ?? [];
  const persistedAccessOverrides = securityData?.accessOverrides ?? [];
  const userSessions = securityData?.sessions ?? [];

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

  const updateAccess = useMutation({
    mutationFn: ({ userId, overrides }: { userId: string; overrides: Record<string, { access_level: AccessLevel; actions: AccessActions }> }) =>
      callAdminUsers("update_access", { tenant_id: tenantId, user_id: userId, access_overrides: overrides }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ["users-admin-security", tenantId, selectedUser?.user_id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Toegang loggen mislukt"),
  });

  const resetPassword = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      callAdminUsers("reset_password", { tenant_id: tenantId, user_id: userId }),
    onSuccess: () => {
      toast.success("Resetlink verstuurd");
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ["users-admin-security", tenantId, selectedUser?.user_id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Wachtwoord resetten mislukt"),
  });

  const deactivateUser = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      callAdminUsers("deactivate_user", { tenant_id: tenantId, user_id: userId }),
    onSuccess: () => {
      toast.success("Gebruiker gedeactiveerd");
      invalidateUsers();
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser?.user_id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Deactiveren mislukt"),
  });

  const updateSecurity = useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: Partial<UserSecuritySettings> }) =>
      callAdminUsers("update_security", { tenant_id: tenantId, user_id: userId, security_patch: patch }),
    onSuccess: () => {
      toast.success("Beveiliging bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["users-admin-security", tenantId, selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser?.user_id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Beveiliging wijzigen mislukt"),
  });

  const revokeSessions = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      callAdminUsers("revoke_sessions", { tenant_id: tenantId, user_id: userId }),
    onSuccess: () => {
      toast.success("Sessies gemarkeerd voor vernieuwing");
      queryClient.invalidateQueries({ queryKey: ["users-admin-security", tenantId, selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser?.user_id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sessies bijwerken mislukt"),
  });

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) =>
      (roleFilter === "all" || getPrimaryRole(u) === roleFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "active" && isUserActive(u)) ||
        (statusFilter === "inactive" && !isUserActive(u))) &&
      (!term ||
        [u.display_name, u.email, u.user_id, ...u.roles]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))),
    );
  }, [roleFilter, searchTerm, statusFilter, users]);

  const effectiveAccess = useMemo(() => {
    return accessMatrix.map((item) => ({
      ...item,
      level: accessOverrides[item.module] ?? item[configRole],
      defaultLevel: item[configRole],
      actions: getAccessActions(item.module, accessOverrides[item.module] ?? item[configRole], customLimitedActions[item.module]),
    }));
  }, [accessOverrides, configRole, customLimitedActions]);

  const filteredUserActivity = useMemo(
    () => userActivity.filter((event) => matchesActivityFilter(event, activityFilter)),
    [activityFilter, userActivity],
  );

  const impactLines = useMemo(() => {
    const byModule = Object.fromEntries(effectiveAccess.map((item) => [item.module, item]));
    const lines: string[] = [];

    if (byModule.Tarieven?.actions.edit) lines.push("Tarieven aanpassen");
    if (byModule.Tarieven?.level === "limited" && byModule.Tarieven.actions.view && !byModule.Tarieven.actions.edit) {
      lines.push("Tarieven bekijken, niet aanpassen");
    }
    if (byModule.Gebruikers?.actions.edit) lines.push("Gebruikers beheren");
    if (byModule.Instellingen?.actions.edit) lines.push("Instellingen wijzigen");
    if (byModule.Facturatie?.actions.edit) lines.push("Facturatie beheren");

    return lines.length > 0 ? lines : ["Geen beheerimpact buiten dagelijkse operatie"];
  }, [effectiveAccess]);

  const hasAccessOverrides = Object.keys(accessOverrides).length > 0;

  const setModuleAccess = (module: string, level: AccessLevel) => {
    setAccessOverrides((current) => {
      const item = accessMatrix.find((entry) => entry.module === module);
      if (!item || item[configRole] !== level) {
        return { ...current, [module]: level };
      }

      const next = { ...current };
      delete next[module];
      return next;
    });
    setExpandedAccessModule(module);
    if (level !== "limited") {
      setAdvancedLimitedModules((current) => ({ ...current, [module]: false }));
    }
    setConfigSaved(false);
  };

  const resetAccessOverrides = () => {
    setAccessOverrides({});
    setExpandedAccessModule(null);
    setAdvancedLimitedModules({});
    setCustomLimitedActions({});
    setConfigSaved(false);
  };

  const setLimitedAction = (module: string, action: AccessAction, value: boolean) => {
    setCustomLimitedActions((current) => ({
      ...current,
      [module]: {
        ...(current[module] ?? limitedActionsByModule[module] ?? getAccessActions(module, "limited")),
        [action]: value,
      },
    }));
    setConfigSaved(false);
  };

  useEffect(() => {
    if (!configSaved) return;
    const timeout = window.setTimeout(() => setConfigSaved(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [configSaved]);

  useEffect(() => {
    if (!selectedUser || securityLoading) return;
    const nextLevels: Record<string, AccessLevel> = {};
    const nextActions: Record<string, AccessActions> = {};

    for (const override of persistedAccessOverrides) {
      nextLevels[override.module] = override.access_level;
      if (override.access_level === "limited") {
        nextActions[override.module] = override.actions;
      }
    }

    setAccessOverrides(nextLevels);
    setCustomLimitedActions(nextActions);
  }, [persistedAccessOverrides, securityLoading, selectedUser?.user_id]);

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
    setConfigTab("profiel");
    setProfileEditing(false);
    setExpandedAccessModule(null);
    setAccessOverrides({});
    setAdvancedLimitedModules({});
    setCustomLimitedActions({});
    setActivityFiltersOpen(false);
    setActivityFilter("all");
  };

  const handleSaveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;

    const currentRole = getPrimaryRole(selectedUser);
    const nextName = configName.trim();
    const tasks: Promise<unknown>[] = [];
    const accessPayload = effectiveAccess.reduce<Record<string, { access_level: AccessLevel; actions: AccessActions }>>((acc, row) => {
      if (row.level !== row.defaultLevel || customLimitedActions[row.module]) {
        acc[row.module] = {
          access_level: row.level,
          actions: row.actions,
        };
      }
      return acc;
    }, {});

    if (nextName !== (selectedUser.display_name ?? "").trim()) {
      tasks.push(updateProfile.mutateAsync({ userId: selectedUser.user_id, displayName: nextName }));
    }
    if (configRole !== currentRole) {
      tasks.push(updateRole.mutateAsync({ userId: selectedUser.user_id, role: configRole }));
    }
    if (Object.keys(accessPayload).length > 0 || persistedAccessOverrides.length > 0) {
      tasks.push(updateAccess.mutateAsync({ userId: selectedUser.user_id, overrides: accessPayload }));
    }

    if (tasks.length === 0) {
      setConfigSaved(true);
      return;
    }

    try {
      await Promise.all(tasks);
      toast.success("Wijzigingen opgeslagen");
      setSelectedUser((user) => user ? { ...user, display_name: nextName || null, roles: [configRole] } : user);
      queryClient.invalidateQueries({ queryKey: ["users-admin-activity", tenantId, selectedUser.user_id] });
      setConfigSaved(true);
    } catch {
      // Mutation handlers already show a concrete error.
    }
  };

  if (!tenantId || isLoading) {
    return <LoadingState message="Gebruikers laden..." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Beheer"
        title="Gebruikers"
        subtitle="Beheer toegang, rollen en profielgegevens voor kantooraccounts."
        actions={isAdmin ? (
          <Button onClick={() => setInviteOpen(true)} className="gap-2 bg-[hsl(var(--ink))] text-white hover:bg-[hsl(var(--gold-deep))]">
            <Plus className="h-4 w-4" />
            Uitnodigen
          </Button>
        ) : undefined}
      />

      <div className="overflow-hidden rounded-lg border border-[hsl(var(--gold)/0.14)] bg-card shadow-sm">
        <div className="border-b border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.32),hsl(var(--card)))] p-5">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setUserFiltersOpen((open) => !open)}
                className={cn(
                  "gap-2",
                  userFiltersOpen && "border-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.62)] text-[hsl(var(--gold-deep))]",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {statusFilter === "all" ? "Filters" : statusFilter === "active" ? "Status: Actief" : "Status: Inactief"}
              </Button>
            </div>
          </div>

          {userFiltersOpen && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-card/80 p-3 ring-1 ring-[hsl(var(--gold)/0.16)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Filters</p>
                <p className="text-xs text-muted-foreground">Filter de lijst op actieve en inactieve gebruikers.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["all", "Alle statussen"],
                  ["active", "Actief"],
                  ["inactive", "Inactief"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      "h-8 rounded-md px-2.5 text-xs font-medium transition-colors ring-1",
                      statusFilter === value
                        ? "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.24)]"
                        : "bg-background text-muted-foreground ring-border/40 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
                {statusFilter !== "all" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                    className="h-8 px-2 text-xs text-muted-foreground"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={users.length === 0 ? "Geen gebruikers gevonden" : "Geen resultaten"}
            description={users.length === 0 ? "Nodig de eerste gebruiker uit om toegang te geven." : "Pas je zoekterm aan om gebruikers te tonen."}
            className="py-16"
            action={isAdmin && users.length === 0 ? (
              <Button onClick={() => setInviteOpen(true)} className="gap-2 bg-[hsl(var(--ink))] text-white hover:bg-[hsl(var(--gold-deep))]">
                <Plus className="h-4 w-4" />
                Uitnodigen
              </Button>
            ) : undefined}
          />
        ) : (
          <>
          <div className="divide-y divide-[hsl(var(--gold)/0.1)] md:hidden">
            {filteredUsers.map((row, idx) => {
              const primaryRole = getPrimaryRole(row);
              const isCurrentUser = currentUser?.id === row.user_id;
              const active = isUserActive(row);

              return (
                <motion.div
                  key={row.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--gold-soft)),hsl(var(--card)))] text-xs font-semibold text-[hsl(var(--gold-deep))] shadow-sm ring-1 ring-[hsl(var(--gold)/0.18)]">
                      {(row.display_name || row.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{row.display_name || "Onbekend"}</p>
                            {isCurrentUser && <Badge variant="secondary" className="text-[10px] px-1.5">Jij</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email ?? `${row.user_id.slice(0, 8)}...`}</p>
                        </div>
                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", active ? "bg-[hsl(var(--gold-deep))]" : "bg-muted-foreground/45")} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs px-2.5 py-1", roleStyles[primaryRole])}>
                          {primaryRole === "admin" ? <Shield className="h-2.5 w-2.5 mr-1" /> : <UserCog className="h-2.5 w-2.5 mr-1" />}
                          {roleLabels[primaryRole]}
                        </Badge>
                        <span className="rounded-md border border-[hsl(var(--gold)/0.16)] px-2 py-0.5 text-xs text-muted-foreground">
                          {active ? "Actief" : "Inactief"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(row.last_sign_in_at)}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openConfig(row)}
                        aria-label={`Bewerken ${row.display_name || row.email || "gebruiker"}`}
                        className="h-9 w-9 shrink-0 border-[hsl(var(--gold)/0.20)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.55)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                {isAdmin && <col className="w-[8%]" />}
              </colgroup>
              <thead>
                <tr className="border-b border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.20)]">
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
                  const active = isUserActive(row);

                  return (
                    <motion.tr
                      key={row.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="transition-colors duration-150 hover:bg-[hsl(var(--gold-soft)/0.24)]"
                    >
                      <td className="px-5 py-5 min-w-[300px]">
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--gold-soft)),hsl(var(--card)))] text-xs font-semibold text-[hsl(var(--gold-deep))] shadow-sm ring-1 ring-[hsl(var(--gold)/0.18)]">
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
                          <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[hsl(var(--gold-deep))]" : "bg-muted-foreground/50")} />
                          {active ? "Actief" : "Inactief"}
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
                            variant="outline"
                            size="sm"
                            onClick={() => openConfig(row)}
                            aria-label={`Bewerken ${row.display_name || row.email || "gebruiker"}`}
                            className="h-8 gap-1.5 border-[hsl(var(--gold)/0.20)] px-2.5 text-xs text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.55)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Bewerken
                          </Button>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.18)] px-5 py-3">
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
              <Button type="submit" disabled={inviteUser.isPending} className="gap-2 bg-[hsl(var(--ink))] text-white hover:bg-[hsl(var(--gold-deep))]">
                {inviteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Versturen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="flex h-[92vh] w-[calc(100vw-32px)] max-w-[1280px] flex-col gap-0 overflow-hidden p-0">
          {selectedUser && (
            <form onSubmit={handleSaveConfig} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.28),hsl(var(--background)))] px-7 py-6">
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
                  <DialogHeader className="space-y-0 text-left">
                    <DialogTitle className="text-base">Gebruiker configureren</DialogTitle>
                    <DialogDescription className="sr-only">
                      Configureer profiel, rol, toegang en beheeracties voor deze gebruiker.
                    </DialogDescription>
                  </DialogHeader>
                </div>

                <div className="mt-6 flex items-center gap-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.16)]">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--gold-soft)),hsl(var(--card)))] text-lg font-semibold text-[hsl(var(--gold-deep))] shadow-sm ring-1 ring-[hsl(var(--gold)/0.22)]">
                    {(selectedUser.display_name || selectedUser.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-foreground">{selectedUser.display_name || "Onbekend"}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{roleLabels[getPrimaryRole(selectedUser)]} gebruiker</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className={cn(
                        "rounded-full px-2.5 py-1 ring-1",
                        isUserActive(selectedUser)
                          ? "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]"
                          : "bg-muted text-muted-foreground ring-border/50",
                      )}>
                        {isUserActive(selectedUser) ? "Actief" : "Inactief"}
                      </Badge>
                      <span>Laatste login: {formatDate(selectedUser.last_sign_in_at)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", roleStyles[getPrimaryRole(selectedUser)])}>
                    {roleLabels[getPrimaryRole(selectedUser)]}
                  </Badge>
                </div>

                <div className="mt-6 flex gap-6 border-b border-[hsl(var(--gold)/0.18)]">
                  {configTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setConfigTab(tab.id)}
                      className={cn(
                        "border-b-2 px-0 pb-3 text-sm transition-colors",
                        configTab === tab.id
                          ? "border-[hsl(var(--gold-deep))] text-[hsl(var(--gold-deep))]"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className={cn(
                  "mt-3 flex items-center gap-2 rounded-lg bg-[hsl(var(--gold-soft)/0.72)] px-3 py-2 text-sm font-medium text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.20)] transition-opacity duration-300",
                  configSaved ? "opacity-100" : "pointer-events-none opacity-0",
                )}>
                    <CheckCircle2 className="h-4 w-4" />
                    Wijzigingen opgeslagen
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--gold-soft)/0.14))] px-7 py-7">
                <div className="space-y-6">
                  {configTab === "profiel" && (
                    <section className="space-y-5">
                      <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Profiel</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Wordt gebruikt in overzichten en logs.</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setProfileEditing((editing) => !editing)}
                            className="gap-2 border-[hsl(var(--gold)/0.20)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.55)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {profileEditing ? "Sluiten" : "Bewerken"}
                          </Button>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-[#F7F7F7] p-4">
                            <p className="text-xs font-medium text-muted-foreground">Naam</p>
                            {profileEditing ? (
                              <Input
                                id="config-name"
                                aria-label="Weergavenaam"
                                value={configName}
                                onChange={(event) => {
                                  setConfigName(event.target.value);
                                  setConfigSaved(false);
                                }}
                                placeholder="Naam van de gebruiker"
                                className="mt-2 h-10 bg-white"
                              />
                            ) : (
                              <p className="mt-2 text-sm font-semibold text-foreground">{configName || "Onbekend"}</p>
                            )}
                          </div>
                          <div className="rounded-lg bg-[#F7F7F7] p-4">
                            <p className="text-xs font-medium text-muted-foreground">E-mail</p>
                            <p className="mt-2 truncate text-sm font-semibold text-foreground">{selectedUser.email ?? selectedUser.user_id}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-3">
                        <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full ring-1",
                              isUserActive(selectedUser)
                                ? "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]"
                                : "bg-muted text-muted-foreground ring-border/50",
                            )}>
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Account status</p>
                              <p className="mt-1 text-xs text-muted-foreground">{isUserActive(selectedUser) ? "Actief" : "Inactief"}</p>
                            </div>
                          </div>
                          <div className="mt-4 border-t border-border/30 pt-3 text-xs text-muted-foreground">
                            Laatste login: <span className="font-medium text-foreground">{formatDate(selectedUser.last_sign_in_at)}</span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.20)]">
                              {configRole === "admin" ? <Crown className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Rol</p>
                              <p className="mt-1 text-xs text-muted-foreground">{roleLabels[configRole]} gebruiker</p>
                            </div>
                          </div>
                          <div className="mt-4 border-t border-border/30 pt-3 text-xs text-muted-foreground">
                            {configRole === "admin" ? "Heeft volledige toegang" : "Dagelijkse operatie en planning"}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setConfigTab("beveiliging")}
                          className="rounded-lg bg-card p-5 text-left shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)] transition-colors hover:bg-[hsl(var(--gold-soft)/0.18)]"
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full ring-1",
                              securitySettings.extra_security_enabled
                                ? "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]"
                                : "bg-primary-50 text-primary-700 ring-primary-100",
                            )}>
                              <Shield className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Beveiliging</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {securitySettings.extra_security_enabled ? "2FA vereist" : "2FA niet verplicht"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 border-t border-border/30 pt-3 text-xs text-muted-foreground">
                            Open beveiliging om dit account verder te controleren.
                          </div>
                        </button>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                        <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-foreground">Laatste activiteit</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Meest recente accountgebeurtenissen.</p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setConfigTab("activiteit")}>
                              Bekijk alles
                            </Button>
                          </div>
                          <div className="mt-4 space-y-2">
                            {activityLoading ? (
                              <LoadingState message="Activiteit laden..." className="py-5" />
                            ) : userActivity.length === 0 ? (
                              <p className="rounded-lg bg-muted/20 p-3 text-xs text-muted-foreground">Nog geen activiteit bekend.</p>
                            ) : (
                              userActivity.slice(0, 2).map((event) => {
                                const item = activityPresentation(event);
                                const Icon = item.icon;
                                return (
                                  <div key={event.id} className="flex items-start gap-3 rounded-lg bg-[#F7F7F7] p-3">
                                    <Icon className="mt-0.5 h-4 w-4 text-[hsl(var(--gold-deep))]" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-foreground">{item.title}</p>
                                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatActivityDate(event.created_at)}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                          <h3 className="text-sm font-semibold text-foreground">Snelle acties</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Veelgebruikte beheeracties voor dit account.</p>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <Button type="button" variant="outline" className="justify-start gap-2" disabled={!selectedUser.email || resetPassword.isPending} onClick={() => resetPassword.mutate({ userId: selectedUser.user_id })}>
                              {resetPassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                              Wachtwoord resetten
                            </Button>
                            <Button type="button" variant="outline" className="justify-start gap-2" disabled={revokeSessions.isPending || securityLoading} onClick={() => revokeSessions.mutate({ userId: selectedUser.user_id })}>
                              {revokeSessions.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
                              Sessie beeindigen
                            </Button>
                            <Button type="button" variant="outline" className="justify-start gap-2 border-primary-100 text-primary-700 hover:bg-primary-50" disabled={selectedUser.user_id === currentUser?.id || deactivateUser.isPending} onClick={() => deactivateUser.mutate({ userId: selectedUser.user_id })}>
                              {deactivateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                              Account deactiveren
                            </Button>
                            <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => setConfigTab("toegang")}>
                              <ShieldCheck className="h-4 w-4" />
                              Rechten bekijken
                            </Button>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {configTab === "toegang" && (
                    <>
                      <section className="space-y-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Toegangsrechten</h3>
                            <p className="text-xs text-muted-foreground">Bepaal tot welke modules en acties deze gebruiker toegang heeft.</p>
                          </div>
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
                                  setAccessOverrides({});
                                  setExpandedAccessModule(null);
                                  setAdvancedLimitedModules({});
                                  setCustomLimitedActions({});
                                  setConfigSaved(false);
                                }}
                                className={cn(
                                  "group rounded-lg p-4 text-left shadow-sm ring-1 transition-all",
                                  role === "admin"
                                    ? "bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.66),hsl(var(--card)))] ring-[hsl(var(--gold)/0.24)] hover:bg-[hsl(var(--gold-soft)/0.62)]"
                                    : "bg-background ring-border/30 hover:bg-muted/20",
                                  checked && (role === "admin" ? "ring-2 ring-[hsl(var(--gold)/0.58)]" : "ring-2 ring-[hsl(var(--gold)/0.32)]"),
                                  locked && "cursor-not-allowed opacity-50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
                                    role === "admin" ? "bg-white text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.24)]" : "bg-muted/20 text-foreground ring-border/50",
                                  )}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-foreground">{access.label}</p>
                                      {checked && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--gold-deep))]" />}
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

                      <section className="flex gap-3 rounded-lg bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.72),hsl(var(--card)))] p-5 text-[hsl(var(--gold-deep))] shadow-sm ring-1 ring-[hsl(var(--gold)/0.22)]">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <h3 className="text-sm font-semibold">Met deze rol</h3>
                          <div className="mt-3 space-y-2">
                            {impactLines.map((line) => (
                              <div key={line} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>

                      <section className="overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--gold)/0.14)] px-4 py-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modules</p>
                            <p className="text-xs text-muted-foreground/60">Standaardrechten + afwijkingen per module</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!hasAccessOverrides}
                            onClick={resetAccessOverrides}
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Reset alle overrides
                          </Button>
                        </div>
                        <div className="sticky top-0 z-10 grid grid-cols-[minmax(220px,1fr)_128px_164px_28px] gap-x-4 border-b border-[hsl(var(--gold)/0.16)] bg-card/95 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 backdrop-blur">
                          <div>Module</div>
                          <div>Toegang</div>
                          <div>Override (afwijking van rol)</div>
                          <div />
                        </div>
                        <div className="divide-y divide-border/30">
                          {effectiveAccess.map((row) => {
                            const Icon = row.icon;
                            const expanded = expandedAccessModule === row.module;
                            const overridden = row.level !== row.defaultLevel;
                            return (
                              <div
                                key={row.module}
                                className={cn(
                                  "cursor-pointer transition-colors hover:bg-[hsl(var(--gold-soft)/0.22)]",
                                  expanded && "bg-[hsl(var(--gold-soft)/0.22)]",
                                )}
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setExpandedAccessModule(expanded ? null : row.module)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setExpandedAccessModule(expanded ? null : row.module);
                                    }
                                  }}
                                  className="grid min-h-[52px] w-full grid-cols-[minmax(220px,1fr)_128px_164px_28px] items-center gap-x-4 px-4 py-1.5 text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <Icon className="h-4 w-4 text-muted-foreground/70" />
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{row.module}</p>
                                      <p className="text-xs text-muted-foreground/50">{row.description}</p>
                                    </div>
                                  </div>
                                  <AccessStatus level={row.level} overridden={overridden} />
                                  <div onClick={(event) => event.stopPropagation()}>
                                    <Select
                                      value={row.level}
                                      onValueChange={(value) => {
                                        setModuleAccess(row.module, value as AccessLevel);
                                      }}
                                    >
                                      <SelectTrigger className={cn(
                                        "h-7 rounded-md border-[#EAEAEA] bg-transparent px-3 text-xs text-muted-foreground shadow-none [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-50",
                                        "focus:ring-1 focus:ring-[hsl(var(--gold)/0.24)] focus:ring-offset-0",
                                        overridden && "border-[hsl(var(--gold)/0.28)] text-[hsl(var(--gold-deep))]",
                                      )}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Geen</SelectItem>
                                        <SelectItem value="limited">Beperkt</SelectItem>
                                        <SelectItem value="full">Volledig</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                                </div>
                                {expanded && (
                                  <div className="border-t border-border/30 bg-muted/10 px-12 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          {row.module}
                                        </p>
                                        <p className="text-sm font-semibold text-foreground">
                                          {accessLabel(row.level)} geselecteerd
                                        </p>
                                      </div>
                                      {overridden && row.level === "limited" && (
                                    <p className="rounded-full bg-[hsl(var(--gold-soft)/0.72)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.20)]">
                                          Beperkt omdat: {roleLabels[configRole]} rol is overschreven
                                        </p>
                                      )}
                                    </div>
                                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`access-${row.module}`}
                                          checked={row.level === "none"}
                                          onChange={() => {
                                            setModuleAccess(row.module, "none");
                                          }}
                                        />
                                        Geen toegang
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`access-${row.module}`}
                                          checked={row.level === "limited"}
                                          onChange={() => {
                                            setModuleAccess(row.module, "limited");
                                          }}
                                        />
                                        Beperkt
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`access-${row.module}`}
                                          checked={row.level === "full"}
                                          onChange={() => {
                                            setModuleAccess(row.module, "full");
                                          }}
                                        />
                                        Volledig
                                      </label>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      {(Object.keys(actionLabels) as AccessAction[]).map((action) => {
                                        const allowed = row.actions[action];
                                        return (
                                          <div
                                            key={action}
                                            className={cn(
                                              "flex items-center gap-2 rounded-md px-3 py-2 text-xs ring-1",
                                              allowed
                                                ? "bg-background text-foreground ring-border/40"
                                                : "bg-muted/30 text-muted-foreground ring-border/30",
                                            )}
                                          >
                                            {allowed ? (
                                              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                                            ) : (
                                              <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            )}
                                            <span>
                                              {allowed
                                                ? `Mag ${row.module.toLowerCase()} ${actionLabels[action].toLowerCase()}`
                                                : `Mag ${row.module.toLowerCase()} niet ${actionLabels[action].toLowerCase()}`}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {row.level === "limited" && (
                                      <div className="mt-3 rounded-lg bg-[hsl(var(--gold-soft)/0.62)] px-3 py-3 text-xs text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.20)]">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div>
                                            <p className="font-semibold">Beperkt is concreet vastgelegd</p>
                                            <p className="text-[hsl(var(--gold-deep)/0.72)]">Bekijken staat aan; wijzigen en verwijderen blijven standaard uit.</p>
                                          </div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setAdvancedLimitedModules((current) => ({
                                              ...current,
                                              [row.module]: !current[row.module],
                                            }))}
                                            className="h-7 px-2 text-xs text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.85)]"
                                          >
                                            Beperkt aanpassen
                                          </Button>
                                        </div>
                                        {advancedLimitedModules[row.module] && (
                                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                                            {(Object.keys(actionLabels) as AccessAction[]).map((action) => (
                                              <label key={action} className="flex items-center gap-2 rounded-md bg-white/60 px-2 py-1.5 ring-1 ring-[hsl(var(--gold)/0.18)]">
                                                <input
                                                  type="checkbox"
                                                  checked={row.actions[action]}
                                                  onChange={(event) => setLimitedAction(row.module, action, event.target.checked)}
                                                />
                                                {actionLabels[action]}
                                              </label>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </>
                  )}

                  {configTab === "activiteit" && (
                    <section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Activiteit</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Overzicht van belangrijke acties en wijzigingen.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActivityFiltersOpen((open) => !open)}
                          className={cn(
                            "h-9 gap-2 rounded-md bg-background px-3 text-xs",
                            activityFiltersOpen && "border-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.62)] text-[hsl(var(--gold-deep))]",
                          )}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {activityFilter === "all" ? "Filter" : activityFilterLabels[activityFilter]}
                        </Button>
                      </div>

                      {activityFiltersOpen && (
                        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-[hsl(var(--gold-soft)/0.22)] p-3 ring-1 ring-[hsl(var(--gold)/0.14)] sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Filter activiteit</p>
                            <p className="text-xs text-muted-foreground">Toon alleen het type events dat je wilt controleren.</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(Object.keys(activityFilterLabels) as ActivityFilter[]).map((filter) => (
                              <button
                                key={filter}
                                type="button"
                                onClick={() => setActivityFilter(filter)}
                                className={cn(
                                  "h-8 rounded-md px-2.5 text-xs font-medium transition-colors ring-1",
                                  activityFilter === filter
                                    ? "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.24)]"
                                    : "bg-background text-muted-foreground ring-border/40 hover:text-foreground",
                                )}
                              >
                                {activityFilterLabels[filter]}
                              </button>
                            ))}
                            {activityFilter !== "all" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setActivityFilter("all")}
                                className="h-8 px-2 text-xs text-muted-foreground"
                              >
                                Reset
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-6">
                        {activityLoading ? (
                          <LoadingState message="Activiteit laden..." className="py-10" />
                        ) : userActivity.length === 0 ? (
                          <EmptyState
                            icon={History}
                            title="Nog geen activiteit"
                            description="Nieuwe rol-, profiel- en toegangsacties worden vanaf nu automatisch vastgelegd."
                            className="py-10"
                          />
                        ) : filteredUserActivity.length === 0 ? (
                          <EmptyState
                            icon={History}
                            title="Geen activiteit voor dit filter"
                            description="Kies een ander filter om meer events te zien."
                            className="py-10"
                          />
                        ) : (
                          <div className="relative">
                            <div className="absolute left-[18px] top-5 h-[calc(100%-40px)] w-px bg-border/60" />
                            <div className="space-y-1">
                              {filteredUserActivity.map((event) => {
                                const item = activityPresentation(event);
                                const Icon = item.icon;
                                return (
                                  <div key={event.id} className="relative flex gap-4 py-3">
                                    <div className={cn(
                                      "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1",
                                      item.tone === "success" && "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]",
                                      item.tone === "warning" && "bg-primary-50 text-primary-700 ring-primary-100",
                                      item.tone === "neutral" && "bg-muted/70 text-foreground ring-border/50",
                                    )}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1 border-b border-border/30 pb-3 last:border-b-0">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                                        </div>
                                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                                          <p>{formatActivityDate(event.created_at)}</p>
                                          <p className="mt-1">{formatActivityTime(event.created_at)}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {configTab === "beveiliging" && (
                    <section className="space-y-5">
                      <div className={cn(
                        "rounded-lg p-6 shadow-sm ring-1",
                        isUserActive(selectedUser) && securitySettings.login_protection_enabled && securitySettings.extra_security_enabled
                          ? "bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.58),hsl(var(--card)))] ring-[hsl(var(--gold)/0.20)]"
                          : "bg-[linear-gradient(135deg,var(--primary-50),hsl(var(--card)))] ring-primary-100",
                      )}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "flex h-12 w-12 items-center justify-center rounded-full ring-1",
                              isUserActive(selectedUser) && securitySettings.login_protection_enabled && securitySettings.extra_security_enabled
                                ? "bg-[hsl(var(--gold-soft)/0.75)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.24)]"
                                : "bg-primary-50 text-primary-700 ring-primary-100",
                            )}>
                              {isUserActive(selectedUser) && securitySettings.login_protection_enabled && securitySettings.extra_security_enabled ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                            </div>
                            <div>
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beveiliging</h3>
                              <p className="mt-1 text-xl font-semibold text-foreground">
                                {isUserActive(selectedUser) && securitySettings.login_protection_enabled && securitySettings.extra_security_enabled ? "Account veilig" : "Actie vereist"}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {securitySettings.extra_security_enabled ? "2FA is verplicht voor dit account" : "2FA is nog niet verplicht"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Laatste controle: {formatDate(securitySettings.updated_at)} · Laatste login: {formatDate(selectedUser.last_sign_in_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 self-start">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setConfigTab("instellingen")}
                              className="gap-2"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Wijzig instellingen
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={selectedUser.user_id === currentUser?.id || deactivateUser.isPending}
                              onClick={() => deactivateUser.mutate({ userId: selectedUser.user_id })}
                              className="gap-2 border-red-100 text-red-700 hover:bg-red-50 hover:text-red-800"
                            >
                              {deactivateUser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                              Deactiveer
                            </Button>
                          </div>
                        </div>
                      </div>

                      {!securitySettings.extra_security_enabled && (
                        <div className="rounded-lg bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.72),hsl(var(--card)))] px-4 py-3 text-sm text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.22)]">
                          <div className="flex gap-3">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
                            <div>
                              <p className="font-semibold">Aanbeveling</p>
                              <p className="mt-1 text-[hsl(var(--gold-deep)/0.78)]">Maak 2FA verplicht voor extra beveiliging van dit account.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid items-stretch gap-5 xl:grid-cols-3">
                        <div className="space-y-5">
                          <div className="flex h-[268px] flex-col rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/20">
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full ring-1",
                                securitySettings.extra_security_enabled
                                  ? "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.22)]"
                                  : "bg-primary-50 text-primary-700 ring-primary-100",
                              )}>
                                <Shield className="h-4 w-4 opacity-70" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">Two-factor authenticatie (2FA)</p>
                                <p className="mt-1 text-xs text-muted-foreground">Verplicht een authenticator-code na wachtwoordlogin.</p>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3 text-xs">
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Status</span>
                                <span className={cn(
                                  "rounded-full px-2 py-1 font-medium ring-1",
                                  securitySettings.extra_security_enabled
                                    ? "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]"
                                    : "bg-primary-50 text-primary-700 ring-primary-100",
                                )}>
                                  {securitySettings.extra_security_enabled ? "Vereist" : "Niet verplicht"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Methode</span>
                                <span className="font-medium text-foreground">
                                  {securitySettings.verification_method === "email" ? "E-mailcode" : "Verificatie app"}
                                </span>
                              </div>
                            </div>
                            <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={updateSecurity.isPending || securityLoading}
                                onClick={() => updateSecurity.mutate({
                                  userId: selectedUser.user_id,
                                  patch: { extra_security_enabled: !securitySettings.extra_security_enabled },
                                })}
                              >
                                {securitySettings.extra_security_enabled ? "Niet meer verplichten" : "2FA verplichten"}
                              </Button>
                              <Select
                                value={securitySettings.verification_method}
                                onValueChange={(value) => updateSecurity.mutate({
                                  userId: selectedUser.user_id,
                                  patch: { verification_method: value as UserSecuritySettings["verification_method"] },
                                })}
                              >
                                <SelectTrigger className="h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="authenticator_app">Verificatie app</SelectItem>
                                  <SelectItem value="email">E-mailcode</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex h-[268px] flex-col rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/20">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.18)]">
                                <Monitor className="h-4 w-4 opacity-70" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">Actieve sessies</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {userSessions.filter((session) => !session.revoked_at).length} actieve sessie{userSessions.filter((session) => !session.revoked_at).length === 1 ? "" : "s"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3">
                              {userSessions.filter((session) => !session.revoked_at).length > 0 ? (
                                <>
                                  <div className="flex items-start justify-between gap-3 rounded-md bg-muted/20 p-3">
                                    <div className="flex items-start gap-2">
                                      <Monitor className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                      <div>
                                        <p className="text-xs font-medium text-foreground">{userSessions.find((session) => !session.revoked_at)?.browser ?? "Onbekende browser"} op {userSessions.find((session) => !session.revoked_at)?.platform ?? "onbekend apparaat"}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Laatst gezien: {formatDate(userSessions.find((session) => !session.revoked_at)?.last_seen_at ?? selectedUser.last_sign_in_at)}</p>
                                      </div>
                                    </div>
                                    <span className="rounded-full bg-[hsl(var(--gold-soft)/0.68)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.20)]">
                                      Laatste sessie
                                    </span>
                                  </div>
                                  {securitySettings.sessions_revoked_at && (
                                    <div className="flex items-start gap-2 rounded-md bg-[hsl(var(--gold-soft)/0.65)] p-3 text-xs text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.22)]">
                                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                      <span>Andere sessies gemarkeerd voor hercontrole op {formatDate(securitySettings.sessions_revoked_at)}.</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">Deze gebruiker heeft nog geen login geregistreerd.</p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-auto w-full"
                              disabled={revokeSessions.isPending || securityLoading}
                              onClick={() => revokeSessions.mutate({ userId: selectedUser.user_id })}
                            >
                              {revokeSessions.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Alle andere sessies beëindigen
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-5">
                          <div className="flex h-[268px] flex-col rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/20">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)/0.18)]">
                                <KeyRound className="h-4 w-4 opacity-70" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">Wachtwoord</p>
                                <p className="mt-1 text-xs text-muted-foreground">Reset alleen wanneer toegang opnieuw bevestigd moet worden.</p>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3 text-xs">
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Sterkte</span>
                                <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground ring-1 ring-border/50">Niet beschikbaar</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Laatste wijziging</span>
                                <span className="font-medium text-foreground">{formatDate(securitySettings.password_reset_sent_at)}</span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-auto w-full"
                              disabled={!selectedUser.email || resetPassword.isPending}
                              onClick={() => resetPassword.mutate({ userId: selectedUser.user_id })}
                            >
                              {resetPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Reset wachtwoord
                            </Button>
                          </div>

                          <div className="flex h-[268px] flex-col rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/20">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/50">
                                <LockKeyhole className="h-4 w-4 opacity-70" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">Inlogbeveiliging</p>
                                <p className="mt-1 text-xs text-muted-foreground">Beschermt tegen ongeautoriseerde toegang.</p>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3 text-xs">
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Status</span>
                                <span className={cn(
                                  "rounded-full px-2 py-1 font-medium ring-1",
                                  securitySettings.login_protection_enabled
                                    ? "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]"
                                    : "bg-red-50 text-red-700 ring-red-100",
                                )}>
                                  {securitySettings.login_protection_enabled ? "Ingeschakeld" : "Uitgeschakeld"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Max. pogingen</span>
                                <span className="font-medium text-foreground">{securitySettings.max_login_attempts} pogingen</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Vergrendeling</span>
                                <span className="font-medium text-foreground">{securitySettings.lockout_minutes} minuten</span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-auto w-full"
                              onClick={() => setConfigTab("instellingen")}
                            >
                              Instellingen aanpassen
                            </Button>
                          </div>
                        </div>

                        <div className="min-h-[556px] rounded-lg bg-background p-5 shadow-sm ring-1 ring-border/20">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-foreground">Recente activiteit</p>
                              <p className="mt-1 text-xs text-muted-foreground">Laatste beveiligings- en accountacties.</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setConfigTab("activiteit");
                                setActivityFiltersOpen(true);
                                setActivityFilter("all");
                              }}
                              className="h-8 px-2 text-xs"
                            >
                              Bekijk alles
                            </Button>
                          </div>

                          <div className="mt-5 space-y-1">
                            {activityLoading ? (
                              <LoadingState message="Activiteit laden..." className="py-8" />
                            ) : userActivity.length === 0 ? (
                              <p className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">Nog geen beveiligingsactiviteit bekend.</p>
                            ) : (
                              userActivity.slice(0, 5).map((event) => {
                                const item = activityPresentation(event);
                                const Icon = event.action === "user.password_reset_sent"
                                  ? KeyRound
                                  : item.tone === "warning"
                                    ? AlertTriangle
                                    : CheckCircle2;
                                return (
                                  <div key={event.id} className="flex gap-3 border-b border-border/25 py-3.5 last:border-b-0">
                                    <div className={cn(
                                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1",
                                      event.action === "user.password_reset_sent" && "bg-[hsl(var(--gold-soft)/0.62)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.18)]",
                                      event.action !== "user.password_reset_sent" && item.tone === "warning" && "bg-primary-50 text-primary-700 ring-primary-100",
                                      event.action !== "user.password_reset_sent" && item.tone !== "warning" && "bg-[hsl(var(--gold-soft)/0.62)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.18)]",
                                    )}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-foreground">{item.title}</p>
                                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatActivityDate(event.created_at)}</span>
                                      </div>
                                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-card p-4 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/50">
                              <Smartphone className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">API toegang</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {userApiTokens.length === 0
                                  ? "Geen actieve API-sleutels voor deze gebruiker."
                                  : `${userApiTokens.filter((token) => !token.revoked_at).length} actieve API-sleutel${userApiTokens.filter((token) => !token.revoked_at).length === 1 ? "" : "s"}.`}
                              </p>
                            </div>
                          </div>
                          {userApiTokens.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {userApiTokens.slice(0, 4).map((token) => (
                                <div key={token.id} className="rounded-md bg-muted/20 p-3 ring-1 ring-border/30">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-foreground">{token.name}</p>
                                      <p className="mt-1 text-[11px] text-muted-foreground">Sleutel {token.token_prefix}</p>
                                    </div>
                                    <span className={cn(
                                      "rounded-full px-2 py-1 text-[11px] font-medium ring-1",
                                      token.revoked_at
                                        ? "bg-muted text-muted-foreground ring-border/50"
                                        : "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.20)]",
                                    )}>
                                      {token.revoked_at ? "Ingetrokken" : "Actief"}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    Laatst gebruikt: {formatDate(token.last_used_at)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfigTab("instellingen")}
                          >
                            Beheer sleutels
                          </Button>
                        </div>
                      </div>
                    </section>
                  )}

                  {configTab === "instellingen" && (
                    <section className="space-y-5">
                      <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <h3 className="text-sm font-semibold text-foreground">Inlogbeveiliging</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Deze velden worden opgeslagen in de database en gebruikt door de login-flow.</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <div className="rounded-lg bg-[#F7F7F7] p-4">
                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                            <Select
                              value={securitySettings.login_protection_enabled ? "enabled" : "disabled"}
                              onValueChange={(value) => updateSecurity.mutate({
                                userId: selectedUser.user_id,
                                patch: { login_protection_enabled: value === "enabled" },
                              })}
                            >
                              <SelectTrigger className="mt-2 h-10 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="enabled">Ingeschakeld</SelectItem>
                                <SelectItem value="disabled">Uitgeschakeld</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="rounded-lg bg-[#F7F7F7] p-4">
                            <p className="text-xs font-medium text-muted-foreground">Max. pogingen</p>
                            <Select
                              value={String(securitySettings.max_login_attempts)}
                              onValueChange={(value) => updateSecurity.mutate({
                                userId: selectedUser.user_id,
                                patch: { max_login_attempts: Number(value) },
                              })}
                            >
                              <SelectTrigger className="mt-2 h-10 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[3, 4, 5, 6, 8, 10].map((value) => (
                                  <SelectItem key={value} value={String(value)}>{value} pogingen</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="rounded-lg bg-[#F7F7F7] p-4">
                            <p className="text-xs font-medium text-muted-foreground">Vergrendeling</p>
                            <Select
                              value={String(securitySettings.lockout_minutes)}
                              onValueChange={(value) => updateSecurity.mutate({
                                userId: selectedUser.user_id,
                                patch: { lockout_minutes: Number(value) },
                              })}
                            >
                              <SelectTrigger className="mt-2 h-10 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[5, 10, 15, 30, 60, 120].map((value) => (
                                  <SelectItem key={value} value={String(value)}>{value} minuten</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-[hsl(var(--gold)/0.14)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">API toegang</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Sleutels worden gelezen uit de echte api_tokens tabel.</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{userApiTokens.filter((token) => !token.revoked_at).length} actief</Badge>
                        </div>
                        <div className="mt-4 grid gap-2">
                          {userApiTokens.length === 0 ? (
                            <p className="rounded-lg bg-[#F7F7F7] p-4 text-xs text-muted-foreground">Geen API-sleutels gekoppeld aan deze gebruiker.</p>
                          ) : (
                            userApiTokens.map((token) => (
                              <div key={token.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F7F7F7] p-4">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{token.name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">Prefix {token.token_prefix} · laatst gebruikt {formatDate(token.last_used_at)}</p>
                                </div>
                                <Badge variant="outline" className={cn("text-xs", token.revoked_at ? "bg-muted text-muted-foreground" : "bg-[hsl(var(--gold-soft)/0.70)] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.20)]")}>
                                  {token.revoked_at ? "Ingetrokken" : "Actief"}
                                </Badge>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <DialogFooter className="border-t border-[hsl(var(--gold)/0.14)] bg-card px-7 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setSelectedUser(null)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={updateProfile.isPending || updateRole.isPending || updateAccess.isPending} className="gap-2 bg-[hsl(var(--ink))] text-white hover:bg-[hsl(var(--gold-deep))]">
                  {(updateProfile.isPending || updateRole.isPending || updateAccess.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  Wijzigingen opslaan
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
