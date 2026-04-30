import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, LogIn, Loader2, Mail,
} from "lucide-react";
import { toast } from "sonner";
import type { Session, User } from "@supabase/supabase-js";
import { PortalLayout } from "@/components/portal/PortalLayout";

// ─── Types ──────────────────────────────────────────────────────────

interface ClientProfile {
  client_id: string;
  client_name: string;
}

interface TenantBranding {
  name: string;
  logo: string | null;
  primaryColor: string;
  portalTitle?: string;
  portalSubtitle?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ClientPortal() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth mode
  const [authMode, setAuthMode] = useState<"password" | "magic">("magic");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Client data
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);

  // ─── Auth listener ────────────────────────────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Load client profile & branding ────────────────────────────────

  useEffect(() => {
    if (!user) {
      setClientProfile(null);
      setTenantBranding(null);
      return;
    }

    const loadClientData = async () => {
      try {
        // Look up client_portal_users first (new system)
        const { data: portalUser } = await supabase
          .from("client_portal_users" as any)
          .select("client_id, tenant_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        let clientId = portalUser?.client_id as string | undefined;
        let tenantId = portalUser?.tenant_id as string | undefined;

        // Fallback: check user metadata
        if (!clientId) {
          clientId = user.user_metadata?.client_id as string | undefined;
        }

        // Fallback: match by email in clients table
        if (!clientId) {
          const { data: clientMatch } = await supabase
            .from("clients")
            .select("id, name, tenant_id")
            .eq("email", user.email ?? "")
            .maybeSingle();

          if (clientMatch) {
            clientId = clientMatch.id;
            tenantId = clientMatch.tenant_id;
          }
        }

        if (!clientId) {
          setClientProfile(null);
          return;
        }

        // Load client name
        const { data: clientData } = await supabase
          .from("clients")
          .select("name, tenant_id")
          .eq("id", clientId)
          .maybeSingle();

        setClientProfile({
          client_id: clientId,
          client_name: clientData?.name ?? user.email ?? "Klant",
        });

        // Load tenant branding
        const resolvedTenantId = tenantId ?? clientData?.tenant_id;
        if (resolvedTenantId) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("name, logo_url, primary_color, branding_settings")
            .eq("id", resolvedTenantId)
            .maybeSingle();

          if (tenant) {
            const settings = (tenant.branding_settings ?? {}) as {
              portalTitle?: string;
              portalSubtitle?: string;
            };
            setTenantBranding({
              name: tenant.name,
              logo: tenant.logo_url ?? null,
              primaryColor: (tenant.primary_color as string) ?? "#dc2626",
              portalTitle: settings.portalTitle,
              portalSubtitle: settings.portalSubtitle,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load client data:", err);
        toast.error("Kon klantgegevens niet laden");
      }
    };

    loadClientData();
  }, [user]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoginError("Ongeldige inloggegevens. Controleer uw email en wachtwoord.");
    }

    setLoginLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setLoginError("Kon geen inloglink versturen. Controleer uw e-mailadres.");
    } else {
      setMagicLinkSent(true);
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setClientProfile(null);
    setMagicLinkSent(false);
  };

  // ─── Loading state ────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc2626]" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        {/* Header bar */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[#dc2626] flex items-center justify-center">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-gray-900">
                Klantportaal
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex flex-col items-center">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Welkom bij het klantportaal</h1>
              <p className="text-gray-500 mt-2">Log in om uw orders te bekijken en nieuwe aan te vragen</p>
            </div>

            <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-4">
              {/* Auth mode toggle */}
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  variant={authMode === "magic" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setAuthMode("magic"); setMagicLinkSent(false); setLoginError(null); }}
                  className="flex-1"
                >
                  Inloglink via e-mail
                </Button>
                <Button
                  type="button"
                  variant={authMode === "password" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setAuthMode("password"); setLoginError(null); }}
                  className="flex-1"
                >
                  Wachtwoord
                </Button>
              </div>

              {authMode === "magic" ? (
                magicLinkSent ? (
                  <div className="text-center py-4">
                    <Mail className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                    <p className="text-gray-900 font-medium">Controleer uw e-mail</p>
                    <p className="text-gray-500 text-sm mt-1">
                      We hebben een inloglink verstuurd naar {email}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-4"
                      onClick={() => setMagicLinkSent(false)}
                    >
                      Opnieuw versturen
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">E-mailadres</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="u@bedrijf.nl"
                        required
                        className="h-11"
                      />
                    </div>

                    {loginError && (
                      <p className="text-sm text-red-600 text-center">{loginError}</p>
                    )}

                    <Button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full h-11 bg-[#dc2626] hover:bg-[#b91c1c] text-white"
                    >
                      {loginLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Versturen...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Inloglink versturen
                        </span>
                      )}
                    </Button>
                  </form>
                )
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">E-mailadres</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="u@bedrijf.nl"
                      required
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Wachtwoord</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Uw wachtwoord"
                      required
                      className="h-11"
                    />
                  </div>

                  {loginError && (
                    <p className="text-sm text-red-600 text-center">{loginError}</p>
                  )}

                  <Button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full h-11 bg-[#dc2626] hover:bg-[#b91c1c] text-white"
                  >
                    {loginLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Inloggen...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <LogIn className="h-4 w-4" />
                        Inloggen
                      </span>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Logged in — render PortalLayout with module content via Outlet
  return (
    <PortalLayout
      user={user}
      clientName={clientProfile?.client_name ?? user.email ?? ""}
      branding={tenantBranding}
      onLogout={handleLogout}
    >
      <Outlet />
    </PortalLayout>
  );
}

