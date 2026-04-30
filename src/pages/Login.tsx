import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Truck, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

const DEV_BYPASS_STORAGE_KEY = "debug_bypass";
const DEV_BYPASS_EMAIL = "test@orderflow.nl";
const DEV_BYPASS_PASSWORD = "Test1234!";

type LoginPolicy = {
  locked_until?: string | null;
  failed_count?: number | null;
  login_protection_enabled?: boolean | null;
  max_login_attempts?: number | null;
  lockout_minutes?: number | null;
  requires_2fa?: boolean | null;
  verification_method?: "authenticator_app" | "email" | string | null;
};

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function isGoogleAuthEnabled() {
  return import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
}

const Login = () => {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [mfaMode, setMfaMode] = useState<"setup" | "verify" | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  // Register fields
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const resetMfaState = () => {
    setMfaMode(null);
    setMfaFactorId("");
    setMfaChallengeId("");
    setMfaQrCode("");
    setMfaSecret("");
    setMfaCode("");
  };

  const startMfaFlow = async () => {
    const mfa = supabase.auth.mfa;
    if (!mfa) {
      throw new Error("MFA is niet beschikbaar in deze Supabase client.");
    }

    const assurance = await mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data?.currentLevel === "aal2") return true;

    const factors = await mfa.listFactors();
    if (factors.error) throw factors.error;
    const verifiedTotp = factors.data?.totp?.find((factor) => factor.status === "verified");

    if (verifiedTotp) {
      const challenge = await mfa.challenge({ factorId: verifiedTotp.id });
      if (challenge.error) throw challenge.error;
      setMfaFactorId(verifiedTotp.id);
      setMfaChallengeId(challenge.data.id);
      setMfaQrCode("");
      setMfaSecret("");
      setMfaCode("");
      setMfaMode("verify");
      return false;
    }

    const enrollment = await mfa.enroll({
      factorType: "totp",
      friendlyName: "OrderFlow TMS",
    });
    if (enrollment.error) throw enrollment.error;

    const challenge = await mfa.challenge({ factorId: enrollment.data.id });
    if (challenge.error) throw challenge.error;

    setMfaFactorId(enrollment.data.id);
    setMfaChallengeId(challenge.data.id);
    setMfaQrCode(enrollment.data.totp.qr_code);
    setMfaSecret(enrollment.data.totp.secret);
    setMfaCode("");
    setMfaMode("setup");
    return false;
  };

  const finishLogin = () => {
    localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
    resetMfaState();
    navigate("/");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText("");

    if (
      import.meta.env.DEV &&
      isLocalDevHost() &&
      loginEmail.trim().toLowerCase() === DEV_BYPASS_EMAIL &&
      loginPassword === DEV_BYPASS_PASSWORD
    ) {
      localStorage.setItem(
        DEV_BYPASS_STORAGE_KEY,
        JSON.stringify({
          email: DEV_BYPASS_EMAIL,
          display_name: "Local Admin",
        }),
      );
      setLoading(false);
      window.location.assign("/");
      return;
    }

    const normalizedEmail = loginEmail.trim().toLowerCase();
    const { data: policyRows } = typeof supabase.rpc === "function"
      ? await supabase.rpc("office_login_policy" as any, { p_email: normalizedEmail })
      : { data: null };
    const loginPolicy = (Array.isArray(policyRows) ? policyRows[0] : null) as LoginPolicy | null;
    if (loginPolicy?.locked_until && new Date(loginPolicy.locked_until).getTime() > Date.now()) {
      setLoading(false);
      setErrorText(`Te veel mislukte pogingen. Probeer opnieuw na ${new Date(loginPolicy.locked_until).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}.`);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: loginPassword,
    });

    if (error) {
      setLoading(false);
      if (loginPolicy?.login_protection_enabled !== false) {
        await supabase.rpc?.("record_office_login_attempt" as any, {
          p_email: normalizedEmail,
          p_success: false,
          p_max_attempts: loginPolicy?.max_login_attempts ?? 5,
          p_lockout_minutes: loginPolicy?.lockout_minutes ?? 15,
        });
      }
      setErrorText("Ongeldig e-mailadres of wachtwoord");
    } else {
      await supabase.rpc?.("record_office_login_attempt" as any, {
        p_email: normalizedEmail,
        p_success: true,
        p_max_attempts: loginPolicy?.max_login_attempts ?? 5,
        p_lockout_minutes: loginPolicy?.lockout_minutes ?? 15,
      });
      if (loginPolicy?.requires_2fa && loginPolicy.verification_method !== "email") {
        try {
          const mfaSatisfied = await startMfaFlow();
          setLoading(false);
          if (mfaSatisfied) finishLogin();
        } catch (mfaError) {
          await supabase.auth.signOut();
          resetMfaState();
          setLoading(false);
          setErrorText(mfaError instanceof Error ? mfaError.message : "2FA kon niet worden gestart");
        }
        return;
      }

      setLoading(false);
      finishLogin();
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || !mfaChallengeId || !mfaCode.trim()) return;

    setMfaLoading(true);
    setErrorText("");

    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode.trim(),
    });

    setMfaLoading(false);

    if (error) {
      setErrorText("Ongeldige 2FA-code. Controleer je verificatie app en probeer opnieuw.");
      return;
    }

    finishLogin();
  };

  const handleCancelMfa = async () => {
    await supabase.auth.signOut();
    resetMfaState();
    setErrorText("");
    setSuccessText("");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText("");
    setSuccessText("");

    if (regPassword.length < 6) {
      setErrorText("Wachtwoord moet minimaal 6 tekens zijn");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        data: {
          display_name: regName,
        },
      },
    });
    setLoading(false);

    if (error) {
      setErrorText(error.message === "User already registered"
        ? "Dit e-mailadres is al geregistreerd"
        : error.message);
    } else {
      setSuccessText("Account aangemaakt! Controleer je e-mail om je account te bevestigen, of log direct in.");
      setTab("login");
      setLoginEmail(regEmail);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setErrorText("");
    setSuccessText("");

    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setErrorText("Vul een geldig e-mailadres in");
      setResetLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + "/login",
    });
    setResetLoading(false);

    if (error) {
      setErrorText(error.message);
    } else {
      setSuccessText(`Reset link verstuurd naar ${resetEmail}`);
      setResetEmail("");
    }
  };

  // Demo login removed for security — use a real test account instead

  return (
    <div className="min-h-screen flex text-slate-900 font-sans">
      {/* Left Split - Local visual, avoids a blocking third-party image on refresh */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-[#0f172a]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(220,38,38,0.3),transparent_35%),radial-gradient(circle_at_25%_20%,rgba(248,250,252,0.14),transparent_24%),linear-gradient(120deg,#0f172a_0%,#1e293b_52%,#111827_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-[12%] right-[10%] bottom-[14%] space-y-4">
          {["#dc2626", "#334155", "#f8fafc", "#475569"].map((color, index) => (
            <div
              key={color}
              className="h-16 rounded-sm shadow-2xl border border-white/10"
              style={{
                background: color,
                transform: `translateX(${index % 2 === 0 ? 0 : 42}px)`,
                opacity: index === 2 ? 0.86 : 0.96,
              }}
            />
          ))}
        </div>
        <div className="absolute left-[16%] bottom-[8%] h-1 w-[58%] rounded-full bg-white/25" />
        <div className="absolute inset-0 bg-[#0f172a]/20" />
      </div>

      {/* Right Split - Form */}
      <div className="w-full lg:w-1/2 bg-[#111827] relative flex items-center justify-center p-6 sm:p-12">

        {/* Top left icon */}
        <div className="absolute top-8 left-8">
          <div className="bg-[#dc2626] p-2.5 rounded text-white shadow-sm">
            <Truck className="h-5 w-5" strokeWidth={2.5} />
          </div>
        </div>

        {/* Version */}
        <div className="absolute bottom-8 right-8 text-slate-500/60 text-xs tracking-wider font-mono">
          v2.4.0
        </div>

        {/* Card */}
        <div className="bg-white w-full max-w-[420px] rounded shadow-2xl p-8 sm:p-10">

          <div className="text-center space-y-1 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{tenant?.name || DEFAULT_COMPANY.name}</h1>
            <p className="text-xs font-bold text-[#dc2626] tracking-[0.2em] uppercase">
              TMS Platform
            </p>
          </div>

          {/* Tabs */}
          <div className={cn("flex border-b border-slate-200 mb-6", (showForgotPassword || mfaMode) && "hidden")}>
            <button
              onClick={() => { setTab("login"); setErrorText(""); setSuccessText(""); setShowForgotPassword(false); }}
              className={cn(
                "flex-1 pb-3 text-sm font-semibold transition-colors border-b-2",
                tab === "login" ? "text-slate-900 border-[#dc2626]" : "text-slate-400 border-transparent hover:text-slate-600"
              )}
            >
              Inloggen
            </button>
            <button
              onClick={() => { setTab("register"); setErrorText(""); setSuccessText(""); }}
              className={cn(
                "flex-1 pb-3 text-sm font-semibold transition-colors border-b-2",
                tab === "register" ? "text-slate-900 border-[#dc2626]" : "text-slate-400 border-transparent hover:text-slate-600"
              )}
            >
              Registreren
            </button>
          </div>

          {/* Success message */}
          {successText && (
            <div className="flex items-start gap-2 text-emerald-700 text-sm font-medium mb-4 bg-emerald-50 border border-emerald-200 rounded p-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successText}</span>
            </div>
          )}

          {/* ─── Login Form ─── */}
          {mfaMode && (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#dc2626]/10 text-[#dc2626]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {mfaMode === "setup" ? "Authenticator app koppelen" : "2FA-code invoeren"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {mfaMode === "setup"
                      ? "Scan de QR-code en bevestig met de 6-cijferige code uit je verificatie app."
                      : "Deze gebruiker heeft 2FA verplicht. Voer de 6-cijferige code uit de verificatie app in."}
                  </p>
                </div>
              </div>

              {mfaMode === "setup" && mfaQrCode && (
                <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-center">
                  <img src={mfaQrCode} alt="QR-code voor authenticator app" className="mx-auto h-44 w-44 rounded bg-white p-2" />
                  {mfaSecret && (
                    <p className="mt-3 break-all rounded-sm bg-white px-3 py-2 font-mono text-xs text-slate-600">
                      {mfaSecret}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="mfa-code" className="text-sm font-semibold text-slate-900">6-cijferige code</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  className="h-11 rounded-sm border-slate-200 text-sm tracking-[0.2em] focus-visible:ring-1 focus-visible:ring-slate-300"
                />
              </div>

              {errorText && (
                <div className="flex items-center gap-2 text-[#dc2626] text-sm font-medium pt-1">
                  <AlertCircle className="h-4 w-4 fill-[#dc2626] text-white" />
                  <span>{errorText}</span>
                </div>
              )}

              <div className="grid grid-cols-[1fr_1.4fr] gap-3 pt-2">
                <Button type="button" variant="outline" className="h-11 rounded-sm" onClick={handleCancelMfa} disabled={mfaLoading}>
                  Annuleren
                </Button>
                <Button type="submit" className="h-11 rounded-sm bg-[#dc2626] text-sm font-semibold text-white hover:bg-[#b91c1c]" disabled={mfaLoading}>
                  {mfaLoading ? "Controleren..." : "Bevestigen"}
                </Button>
              </div>
            </form>
          )}

          {tab === "login" && !showForgotPassword && !mfaMode && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-semibold text-slate-900">E-mailadres</Label>
                <Input
                  id="login-email" type="email" placeholder="naam@bedrijf.nl"
                  value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required
                  className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm font-semibold text-slate-900">Wachtwoord</Label>
                <div className="relative">
                  <Input
                    id="login-password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required
                    className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300 pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {errorText && (
                <div className="flex items-center gap-2 text-[#dc2626] text-sm font-medium pt-1">
                  <AlertCircle className="h-4 w-4 fill-[#dc2626] text-white" />
                  <span>{errorText}</span>
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-sm h-11 text-sm font-semibold" disabled={loading}>
                  {loading ? "Bezig..." : "Inloggen"}
                </Button>
              </div>

              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-xs font-bold tracking-widest uppercase">
                  <span className="bg-white px-3 text-slate-400">Of</span>
                </div>
              </div>

              {isGoogleAuthEnabled() && (
                <Button type="button" variant="outline" onClick={handleGoogleLogin}
                  className="w-full rounded-sm h-11 border-slate-200 text-slate-600 font-medium hover:bg-slate-50">
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-4 w-4 mr-2" />
                  Inloggen met Google
                </Button>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setErrorText(""); setSuccessText(""); setResetEmail(loginEmail); }}
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Wachtwoord vergeten?
                </button>
              </div>
            </form>
          )}

          {/* ─── Forgot Password Form ─── */}
          {showForgotPassword && !mfaMode && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900">Wachtwoord resetten</h3>
              </div>
              <p className="text-xs text-slate-500">
                Vul je e-mailadres in en we sturen je een link om je wachtwoord te resetten.
              </p>

              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-semibold text-slate-900">E-mailadres</Label>
                <Input
                  id="reset-email" type="email" placeholder="naam@bedrijf.nl"
                  value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required
                  className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300"
                  autoFocus
                />
              </div>

              {errorText && (
                <div className="flex items-center gap-2 text-[#dc2626] text-sm font-medium pt-1">
                  <AlertCircle className="h-4 w-4 fill-[#dc2626] text-white" />
                  <span>{errorText}</span>
                </div>
              )}

              {successText && (
                <div className="flex items-start gap-2 text-emerald-700 text-sm font-medium bg-emerald-50 border border-emerald-200 rounded p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{successText}</span>
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-sm h-11 text-sm font-semibold" disabled={resetLoading}>
                  {resetLoading ? "Bezig..." : "Verstuur reset link"}
                </Button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setErrorText(""); setSuccessText(""); }}
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Terug naar inloggen
                </button>
              </div>
            </form>
          )}

          {/* ─── Register Form ─── */}
          {tab === "register" && !mfaMode && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name" className="text-sm font-semibold text-slate-900">Volledige naam</Label>
                <Input
                  id="reg-name" type="text" placeholder="Jan de Vries"
                  value={regName} onChange={(e) => setRegName(e.target.value)} required
                  className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-email" className="text-sm font-semibold text-slate-900">E-mailadres</Label>
                <Input
                  id="reg-email" type="email" placeholder="naam@bedrijf.nl"
                  value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required
                  className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-password" className="text-sm font-semibold text-slate-900">Wachtwoord</Label>
                <div className="relative">
                  <Input
                    id="reg-password" type={showPassword ? "text" : "password"} placeholder="Minimaal 6 tekens"
                    value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required
                    className="h-11 rounded-sm border-slate-200 text-sm focus-visible:ring-1 focus-visible:ring-slate-300 pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {errorText && (
                <div className="flex items-center gap-2 text-[#dc2626] text-sm font-medium pt-1">
                  <AlertCircle className="h-4 w-4 fill-[#dc2626] text-white" />
                  <span>{errorText}</span>
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-sm h-11 text-sm font-semibold" disabled={loading}>
                  {loading ? "Bezig..." : "Account aanmaken"}
                </Button>
              </div>

              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-xs font-bold tracking-widest uppercase">
                  <span className="bg-white px-3 text-slate-400">Of</span>
                </div>
              </div>

              {isGoogleAuthEnabled() && (
                <Button type="button" variant="outline" onClick={handleGoogleLogin}
                  className="w-full rounded-sm h-11 border-slate-200 text-slate-600 font-medium hover:bg-slate-50">
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-4 w-4 mr-2" />
                  Registreren met Google
                </Button>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;
