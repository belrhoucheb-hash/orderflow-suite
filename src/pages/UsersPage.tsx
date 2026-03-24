import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Shield, ShieldCheck, Mail, Loader2, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: string[];
  email?: string;
}

function useUsers() {
  return useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      // Fetch profiles and roles in parallel
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, avatar_url, created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const rolesMap: Record<string, string[]> = {};
      for (const r of rolesRes.data ?? []) {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      }

      return (profilesRes.data ?? []).map((p): UserRow => ({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        roles: rolesMap[p.user_id] || ["medewerker"],
      }));
    },
  });
}

const roleStyles: Record<string, string> = {
  admin: "bg-primary/10 text-primary border-primary/20",
  medewerker: "bg-blue-500/8 text-blue-700 border-blue-200/60",
};

const UsersPage = () => {
  const { isAdmin } = useAuth();
  const { data: users = [], isLoading, refetch } = useUsers();
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isAdmin) {
      toast.error("Alleen admins kunnen rollen wijzigen");
      return;
    }

    setChangingRole(userId);
    try {
      // Remove existing roles
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // Insert new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole as "admin" | "medewerker" });

      if (insertError) throw insertError;

      toast.success("Rol bijgewerkt");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Fout bij wijzigen rol");
    } finally {
      setChangingRole(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">Gebruikers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{users.length} gebruiker{users.length !== 1 ? "s" : ""} geregistreerd</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Totaal", value: users.length, icon: Users, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Admins", value: users.filter((u) => u.roles.includes("admin")).length, icon: ShieldCheck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Medewerkers", value: users.filter((u) => u.roles.includes("medewerker") && !u.roles.includes("admin")).length, icon: UserCog, color: "text-emerald-600", bg: "bg-emerald-500/8" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-card rounded-xl border border-border/40 p-3.5 flex items-center gap-3"
          >
            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div>
              <p className="text-lg font-semibold font-display tabular-nums leading-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-xl shadow-sm border border-border/40 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Gebruiker</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Rol</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden sm:table-cell">Geregistreerd</th>
                {isAdmin && (
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Acties</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {users.map((user, idx) => (
                <motion.tr
                  key={user.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-muted/20 transition-colors duration-100"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                        {(user.display_name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{user.display_name || "Onbekend"}</p>
                        <p className="text-[11px] text-muted-foreground">{user.user_id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {user.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className={cn("text-[10px] px-2 py-0.5 capitalize", roleStyles[role] || roleStyles.medewerker)}
                        >
                          {role === "admin" && <Shield className="h-2.5 w-2.5 mr-1" />}
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-[12px] text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <Select
                        value={user.roles.includes("admin") ? "admin" : "medewerker"}
                        onValueChange={(val) => handleRoleChange(user.user_id, val)}
                        disabled={changingRole === user.user_id}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="medewerker">Medewerker</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  )}
                </motion.tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Geen gebruikers gevonden</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">{users.length} gebruiker{users.length !== 1 ? "s" : ""}</p>
        </div>
      </motion.div>
    </div>
  );
};

export default UsersPage;
