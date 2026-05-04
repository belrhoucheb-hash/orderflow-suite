import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  Mail,
  MapPinned,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";

const DEV_BYPASS_STORAGE_KEY = "debug_bypass";
const DEV_BYPASS_EMAIL = import.meta.env.DEV ? "test@orderflow.nl" : "";
const DEV_BYPASS_PASSWORD = import.meta.env.DEV ? "Test1234!" : "";

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

const BrandCube = ({ className = "h-16 w-16", iconClassName = "h-9 w-9" }: { className?: string; iconClassName?: string }) => (
  <div className={cn("relative grid place-items-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-300/25 via-amber-500/10 to-black/20 shadow-[0_0_60px_rgba(215,163,79,0.25)]", className)}>
    <div className={cn("relative", iconClassName)}>
      <span className="absolute left-[20%] top-[10%] h-[40%] w-[42%] skew-y-[-28deg] rounded-sm bg-gradient-to-br from-amber-200 to-amber-500 shadow-[0_0_18px_rgba(251,191,36,0.35)]" />
      <span className="absolute right-[13%] top-[22%] h-[45%] w-[42%] skew-y-[28deg] rounded-sm bg-gradient-to-br from-amber-500 to-amber-800" />
      <span className="absolute bottom-[8%] left-[28%] h-[42%] w-[44%] skew-y-[28deg] rounded-sm bg-gradient-to-br from-amber-600 to-amber-950" />
      <span className="absolute inset-[18%] rounded-sm border border-black/30" />
    </div>
  </div>
);

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [mfaMode, setMfaMode] = useState<"setup" | "verify" | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  const platformName = "OrderFlow Suite";
  const featureItems = [
    {
      icon: Package,
      title: "Slimme order intake",
      description: "Conversationele wizard en validatie voor foutloze orders.",
    },
    {
      icon: MapPinned,
      title: "Realtime planning & dispatch",
      description: "Routes, middelen en tijdvensters centraal aangestuurd.",
    },
    {
      icon: Truck,
      title: "Volledige cargo controle",
      description: "Van tarief tot documenten en compliance in een flow.",
    },
    {
      icon: BarChart3,
      title: "Data & performance",
      description: "Operationele inzichten voor maximale grip op transport.",
    },
  ];

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
    if (!mfa) throw new Error("MFA is niet beschikbaar in deze Supabase client.");

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
        JSON.stringify({ email: DEV_BYPASS_EMAIL, display_name: "Local Admin" }),
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
      return;
    }

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

  const errorMessage = errorText ? (
    <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{errorText}</span>
    </div>
  ) : null;

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-slate-950 px-12 py-12 lg:flex lg:flex-col">
          <img
            src="/login-hero.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(196,141,55,0.20),transparent_28%),radial-gradient(circle_at_78%_46%,rgba(220,163,68,0.18),transparent_26%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,13,0.98)_0%,rgba(5,8,13,0.83)_38%,rgba(5,8,13,0.22)_100%)]" />
          <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:86px_86px]" />
          <div className="absolute inset-x-0 bottom-0 h-[52%] bg-[linear-gradient(0deg,rgba(5,8,13,0.98)_0%,rgba(5,8,13,0.42)_74%,transparent_100%)]" />

          <div className="relative z-10 flex animate-in fade-in slide-in-from-top-3 duration-700 items-center gap-4">
            <BrandCube />
            <div>
              <div className="text-3xl font-semibold tracking-[0.08em]">
                ORDERFLOW <span className="text-amber-400">SUITE</span>
              </div>
              <div className="mt-1 text-sm font-medium uppercase tracking-[0.32em] text-amber-400">
                TMS PLATFORM
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-auto max-w-3xl animate-in fade-in slide-in-from-bottom-4 pb-8 duration-700">
            <div className="mb-10 max-w-[690px]">
              <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight">
                Van order tot levering.
                <span className="mt-2 block text-amber-400">Volledig in controle.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-white/74">
                De slimme transport management suite voor orderintake, planning en realtime inzicht in al uw zendingen.
              </p>
            </div>

            <div className="grid max-w-xl gap-4">
              {featureItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/14 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
                      <Icon className="h-6 w-6 text-amber-400" strokeWidth={1.75} />
                    </div>
                    <div className="pt-1">
                      <div className="font-semibold text-white">{item.title}</div>
                      <p className="mt-1 text-sm leading-6 text-white/62">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-9 grid max-w-xl grid-cols-[1fr_1px_1fr] items-center gap-7 rounded-2xl border border-white/16 bg-black/24 px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/12 text-amber-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Veilig & betrouwbaar</div>
                  <div className="mt-1 text-xs text-white/55">Uw data is beschermd.</div>
                </div>
              </div>
              <div className="h-12 bg-white/10" />
              <div className="flex items-center gap-4">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
                <div>
                  <div className="text-sm font-semibold">Systeem status</div>
                  <div className="mt-1 text-xs text-white/55">Alle systemen operationeel</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-4 text-xs text-white/46">
            &copy; 2026 OrderFlow Suite. Alle rechten voorbehouden.
          </div>

        </section>

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-8 sm:px-8">
          <div className="absolute inset-x-0 top-0 h-72 overflow-hidden lg:hidden">
            <img src="/login-hero.png" alt="" aria-hidden="true" className="h-full w-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18)_0%,rgba(15,23,42,0.86)_70%,#020617_100%)]" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(215,163,79,0.12),transparent_24%),linear-gradient(180deg,#111827_0%,#0a1019_100%)]" />
          <div className="absolute right-8 top-8 hidden rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/85 shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-2">
            <Globe2 className="h-4 w-4 text-amber-400" />
            Nederlands
          </div>

          <div
            className="relative z-10 w-full max-w-[520px] animate-in fade-in slide-in-from-bottom-4 rounded-[28px] border border-white/14 bg-slate-900/72 p-7 shadow-[0_35px_110px_rgba(0,0,0,0.45)] backdrop-blur-xl duration-700 sm:p-10"
            style={{ boxShadow: "0 34px 110px rgba(0,0,0,0.46), 0 0 0 1px rgba(251,191,36,0.12)" }}
          >
            <div className="mb-9">
              <div className="mb-7 flex items-center gap-3 lg:hidden">
                <BrandCube className="h-12 w-12 rounded-xl" iconClassName="h-7 w-7" />
                <div>
                  <div className="text-lg font-semibold tracking-[0.1em]">ORDERFLOW <span className="text-amber-400">SUITE</span></div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400">TMS PLATFORM</div>
                </div>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Welkom terug</h1>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Log in om verder te gaan met {platformName}.
              </p>
            </div>

            {successText && !showForgotPassword && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-medium text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successText}</span>
              </div>
            )}

            {mfaMode && (
              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/12 text-amber-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {mfaMode === "setup" ? "Authenticator app koppelen" : "2FA-code invoeren"}
                    </h2>
                    <p className="mt-1 text-sm text-white/62">
                      {mfaMode === "setup"
                        ? "Scan de QR-code en bevestig met de 6-cijferige code uit je verificatie app."
                        : "Deze gebruiker heeft 2FA verplicht. Voer de 6-cijferige code uit de verificatie app in."}
                    </p>
                  </div>
                </div>

                {mfaMode === "setup" && mfaQrCode && (
                  <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-center">
                    <img src={mfaQrCode} alt="QR-code voor authenticator app" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
                    {mfaSecret && (
                      <p className="mt-3 break-all rounded-xl bg-white/8 px-3 py-2 font-mono text-xs text-white/70">
                        {mfaSecret}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="mfa-code" className="text-sm font-semibold text-white">6-cijferige code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    className="h-14 rounded-xl border-white/10 bg-slate-950/70 text-white placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-amber-400"
                  />
                </div>
                {errorMessage}
                <div className="grid grid-cols-[1fr_1.4fr] gap-3 pt-2">
                  <Button type="button" variant="outline" className="h-12 rounded-xl border-white/12 bg-white/[0.04] text-white hover:bg-white/10" onClick={handleCancelMfa} disabled={mfaLoading}>
                    Annuleren
                  </Button>
                  <Button type="submit" className="h-12 rounded-xl bg-amber-400 text-sm font-semibold text-slate-950 hover:bg-amber-300" disabled={mfaLoading}>
                    {mfaLoading ? "Controleren..." : "Bevestigen"}
                  </Button>
                </div>
              </form>
            )}

            {!showForgotPassword && !mfaMode && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-semibold text-white">E-mailadres</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="naam@bedrijf.nl"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="h-14 rounded-xl border-white/10 bg-slate-950/70 pl-12 text-white placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-amber-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm font-semibold text-white">Wachtwoord</Label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/36" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="h-14 rounded-xl border-white/10 bg-slate-950/70 pl-12 pr-12 text-white placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-amber-400"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/36 hover:text-white/70 focus:outline-none" aria-label="Toon wachtwoord">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-white/76">
                    <span className="grid h-5 w-5 place-items-center rounded bg-amber-400 text-slate-950">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    Ingelogd blijven
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setErrorText(""); setSuccessText(""); setResetEmail(loginEmail); }}
                    className="text-sm font-medium text-amber-400 hover:text-amber-300"
                  >
                    Wachtwoord vergeten?
                  </button>
                </div>

                {errorMessage}

                <Button type="submit" className="h-14 w-full rounded-xl bg-[linear-gradient(135deg,#e8b65a,#b77a2d)] text-base font-semibold text-white shadow-[0_18px_46px_rgba(215,163,79,0.22)] hover:brightness-110" disabled={loading}>
                  <span>{loading ? "Bezig..." : "Inloggen"}</span>
                  {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>

                <div className="flex items-center justify-center gap-3 pt-3 text-sm text-white/68">
                  <LockKeyhole className="h-4 w-4 text-white/44" />
                  <div>
                    <div className="font-semibold text-white/86">Beveiligde verbinding</div>
                    <div className="text-xs text-white/45">Gebruik het account dat door uw organisatie is verstrekt.</div>
                  </div>
                </div>
              </form>
            )}

            {showForgotPassword && !mfaMode && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white">Wachtwoord resetten</h2>
                </div>
                <p className="text-sm text-white/62">
                  Vul je e-mailadres in en we sturen je een link om je wachtwoord te resetten.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-sm font-semibold text-white">E-mailadres</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="naam@bedrijf.nl"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="h-14 rounded-xl border-white/10 bg-slate-950/70 text-white placeholder:text-white/28 focus-visible:ring-1 focus-visible:ring-amber-400"
                    autoFocus
                  />
                </div>
                {errorMessage}
                {successText && (
                  <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-medium text-emerald-100">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{successText}</span>
                  </div>
                )}
                <Button type="submit" className="h-12 w-full rounded-xl bg-amber-400 text-sm font-semibold text-slate-950 hover:bg-amber-300" disabled={resetLoading}>
                  {resetLoading ? "Bezig..." : "Verstuur reset link"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setErrorText(""); setSuccessText(""); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/54 transition-colors hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Terug naar inloggen
                  </button>
                </div>
              </form>
            )}

          </div>

          <div className="absolute bottom-5 right-6 text-xs font-mono text-white/28">v2.4.0</div>
        </section>
      </div>
    </div>
  );
};

export default Login;
