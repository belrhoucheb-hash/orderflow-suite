import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = "admin" | "medewerker";
type EffectiveRole = "admin" | "planner" | "chauffeur";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { display_name: string | null; avatar_url: string | null } | null;
  roles: AppRole[];
  effectiveRole: EffectiveRole;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLinkedDriver, setIsLinkedDriver] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRoles = async (userId: string) => {
    const [profileRes, rolesRes, driverRes] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("drivers" as any).select("id").eq("user_id", userId).single(),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
    }
    if (rolesRes.data) {
      setRoles(rolesRes.data.map((r) => r.role as AppRole));
    }
    // User is a linked driver if a driver record with their user_id exists
    setIsLinkedDriver(!!driverRes.data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid potential deadlocks with Supabase auth
          setTimeout(() => fetchProfileAndRoles(session.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
          setIsLinkedDriver(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('debug_bypass');
    localStorage.removeItem('chauffeur_mode');
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setIsLinkedDriver(false);
  };

  // Derive effective role: admin > planner > chauffeur
  // DB app_role enum: "admin" | "medewerker"
  // "medewerker" maps to "planner"; chauffeur requires a linked driver record in DB.
  // The chauffeur_mode localStorage flag is only a UI indicator — it cannot
  // grant chauffeur role on its own. The user must also be linked to a driver
  // record in the drivers table (verified via isLinkedDriver).
  // Future: add "chauffeur" to app_role enum in DB.
  const effectiveRole: EffectiveRole = (() => {
    if (roles.includes("admin")) return "admin";
    // Only grant chauffeur role if the user is linked to a driver record in DB
    // AND has the chauffeur_mode UI flag set (prevents localStorage-only bypass)
    if (
      isLinkedDriver &&
      typeof window !== "undefined" &&
      localStorage.getItem("chauffeur_mode") === "true"
    ) return "chauffeur";
    // "medewerker" or no roles -> default to planner
    return "planner";
  })();

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        effectiveRole,
        isAdmin: roles.includes("admin"),
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
