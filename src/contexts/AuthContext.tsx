/* eslint-disable react-refresh/only-export-components -- context provider and hooks share the same module API. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { clearSupabaseAuthStorage, DEV_BYPASS_USER_ID, readDevBypassUser } from "@/lib/devSession";
import {
  defaultAccessByRole,
  getAccessActions,
  moduleForPath,
  normalizeOfficeAccessLevel,
  type OfficeAccessMap,
} from "@/lib/officeAccess";

type AppRole = "admin" | "medewerker";
type EffectiveRole = "admin" | "planner" | "chauffeur";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { display_name: string | null; avatar_url: string | null } | null;
  roles: AppRole[];
  effectiveRole: EffectiveRole;
  isAdmin: boolean;
  officeAccess: OfficeAccessMap;
  hasModuleAccess: (module: string, action?: "view" | "create" | "edit" | "delete") => boolean;
  hasRouteAccess: (pathname: string) => boolean;
  sessionRevoked: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 3_000;
const USER_ACCESS_TIMEOUT_MS = 3_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} duurde langer dan ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createDevBypassSession(user: User): Session {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: "dev-bypass-access-token",
    refresh_token: "dev-bypass-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: nowSeconds + 60 * 60 * 24,
    user,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [officeAccess, setOfficeAccess] = useState<OfficeAccessMap>({});
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [isLinkedDriver, setIsLinkedDriver] = useState(false);
  const [loading, setLoading] = useState(true);
  const profileFetchRef = useRef<{ userId: string; promise: Promise<void>; completedAt: number } | null>(null);

  const ensureSessionKey = useCallback((userId: string) => {
    const key = `office_session_key:${userId}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  }, []);

  const browserLabel = useCallback(() => {
    const agent = navigator.userAgent;
    if (agent.includes("Edg/")) return "Edge";
    if (agent.includes("Chrome/")) return "Chrome";
    if (agent.includes("Firefox/")) return "Firefox";
    if (agent.includes("Safari/")) return "Safari";
    return "Browser";
  }, []);

  const platformLabel = useCallback(() => {
    const platform = navigator.platform || navigator.userAgent;
    if (/Mac/i.test(platform)) return "MacOS";
    if (/Win/i.test(platform)) return "Windows";
    if (/iPhone|iPad/i.test(navigator.userAgent)) return "iOS";
    if (/Android/i.test(navigator.userAgent)) return "Android";
    return platform || "Onbekend apparaat";
  }, []);

  const loadProfileAndRoles = useCallback(async (userId: string) => {
    if (userId === DEV_BYPASS_USER_ID) {
      setProfile({ display_name: "Local Admin", avatar_url: null });
      setRoles(["admin"]);
      setOfficeAccess({});
      setSessionRevoked(false);
      setIsLinkedDriver(false);
      return;
    }

    const [profileRes, rolesRes, membershipRes, driverRes] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("tenant_members").select("tenant_id").eq("user_id", userId).maybeSingle(),
      // Driver-lookup is best-effort. Als drivers.user_id kolom niet
      // bestaat op de DB (migratie nog niet gedraaid) laten we de error
      // niet de hele auth-flow blokkeren. isLinkedDriver valt terug op
      // false, kantoor-gebruikers merken niets.
      supabase
        .from("drivers" as any)
        .select("id")
        .eq("user_id", userId)
        .maybeSingle()
        .then((res) => res, () => ({ data: null, error: null })),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
    }
    if (rolesRes.data) {
      setRoles(rolesRes.data.map((r) => r.role as AppRole));
    }
    const tenantId = membershipRes.data?.tenant_id ?? null;
    if (tenantId) {
      const sessionKey = ensureSessionKey(userId);
      const now = new Date().toISOString();
      await supabase
        .from("office_user_sessions" as any)
        .upsert({
          tenant_id: tenantId,
          user_id: userId,
          session_key: sessionKey,
          browser: browserLabel(),
          platform: platformLabel(),
          user_agent: navigator.userAgent,
          last_seen_at: now,
        }, { onConflict: "tenant_id,user_id,session_key" });

      const [{ data: accessRows }, { data: sessionRow }] = await Promise.all([
        supabase
          .from("office_user_access_overrides" as any)
          .select("module, access_level, actions")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId),
        supabase
          .from("office_user_sessions" as any)
          .select("revoked_at")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("session_key", sessionKey)
          .maybeSingle(),
      ]);

      const nextAccess: OfficeAccessMap = {};
      for (const row of accessRows ?? []) {
        const level = normalizeOfficeAccessLevel(row.access_level);
        if (!level || typeof row.module !== "string") continue;
        nextAccess[row.module] = {
          level,
          actions: getAccessActions(row.module, level, row.actions),
        };
      }
      setOfficeAccess(nextAccess);
      setSessionRevoked(Boolean(sessionRow?.revoked_at));
    } else {
      setOfficeAccess({});
      setSessionRevoked(false);
    }
    // User is a linked driver if a driver record with their user_id exists
    setIsLinkedDriver(!!driverRes.data);
  }, [browserLabel, ensureSessionKey, platformLabel]);

  const fetchProfileAndRoles = useCallback(async (userId: string) => {
    const cached = profileFetchRef.current;
    if (cached?.userId === userId) {
      if (cached.completedAt === 0 || Date.now() - cached.completedAt < 30_000) {
        return cached.promise;
      }
    }

    const promise = loadProfileAndRoles(userId);
    profileFetchRef.current = { userId, promise, completedAt: 0 };
    try {
      await promise;
    } finally {
      if (profileFetchRef.current?.promise === promise) {
        profileFetchRef.current.completedAt = Date.now();
      }
    }
  }, [loadProfileAndRoles]);

  useEffect(() => {
    const initialBypassUser = readDevBypassUser();
    if (initialBypassUser) {
      clearSupabaseAuthStorage();
      const bypassSession = createDevBypassSession(initialBypassUser);
      setSession(bypassSession);
      setUser(initialBypassUser);
      void fetchProfileAndRoles(initialBypassUser.id)
        .catch((error) => {
          console.error("Failed to load user access", error);
        })
        .finally(() => setLoading(false));
      return undefined;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const bypassUser = !session ? readDevBypassUser() : null;
        if (bypassUser) clearSupabaseAuthStorage();
        const effectiveSession = session ?? (bypassUser ? createDevBypassSession(bypassUser) : null);
        const effectiveUser = effectiveSession?.user ?? null;

        setSession(effectiveSession);
        setUser(effectiveUser);

        if (effectiveUser) {
          // Run outside the Supabase auth callback tick while keeping
          // route guards loading until roles/access are known.
          setTimeout(() => {
            void withTimeout(
              fetchProfileAndRoles(effectiveUser.id),
              USER_ACCESS_TIMEOUT_MS,
              "Gebruikerstoegang ophalen",
            )
              .catch((error) => {
                console.error("Failed to load user access", error);
              })
              .finally(() => setLoading(false));
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setOfficeAccess({});
          setSessionRevoked(false);
          setIsLinkedDriver(false);
          setLoading(false);
        }
      }
    );

    withTimeout(supabase.auth.getSession(), AUTH_BOOT_TIMEOUT_MS, "Auth sessie ophalen")
      .then(async ({ data: { session } }) => {
        const bypassUser = !session ? readDevBypassUser() : null;
        if (bypassUser) clearSupabaseAuthStorage();
        const effectiveSession = session ?? (bypassUser ? createDevBypassSession(bypassUser) : null);
        const effectiveUser = effectiveSession?.user ?? null;

        setSession(effectiveSession);
        setUser(effectiveUser);
        if (effectiveUser) {
          try {
            await withTimeout(
              fetchProfileAndRoles(effectiveUser.id),
              USER_ACCESS_TIMEOUT_MS,
              "Gebruikerstoegang ophalen",
            );
          } catch (error) {
            console.error("Failed to load user access", error);
          }
        }
      })
      .catch((error) => {
        const bypassUser = readDevBypassUser();
        if (bypassUser) clearSupabaseAuthStorage();
        const bypassSession = bypassUser ? createDevBypassSession(bypassUser) : null;

        console.error("Failed to initialize auth session", error);
        setSession(bypassSession);
        setUser(bypassSession?.user ?? null);
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, [fetchProfileAndRoles]);

  useEffect(() => {
    if (!user || user.id === DEV_BYPASS_USER_ID) return undefined;
    const interval = window.setInterval(() => {
      void fetchProfileAndRoles(user.id);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchProfileAndRoles, user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("debug_bypass");
    localStorage.removeItem('chauffeur_mode');
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setOfficeAccess({});
    setSessionRevoked(false);
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

  const hasModuleAccess = (module: string, action: "view" | "create" | "edit" | "delete" = "view") => {
    if (officeAccess[module]) return officeAccess[module].actions[action] === true;
    const role: AppRole = roles.includes("admin") ? "admin" : "medewerker";
    const level = defaultAccessByRole[role][module] ?? "full";
    return getAccessActions(module, level)[action] === true;
  };

  const hasRouteAccess = (pathname: string) => {
    const module = moduleForPath(pathname);
    if (!module) return true;
    return hasModuleAccess(module, "view");
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        effectiveRole,
        isAdmin: roles.includes("admin"),
        officeAccess,
        hasModuleAccess,
        hasRouteAccess,
        sessionRevoked,
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

export function useAuthOptional(): { user: User | null } {
  const ctx = useContext(AuthContext);
  if (!ctx) return { user: null };
  return { user: ctx.user };
}
