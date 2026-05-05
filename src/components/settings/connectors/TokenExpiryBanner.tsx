import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startExactOAuth } from "@/hooks/useConnectors";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

interface Props {
  provider: string;
  expiresAt: string | null | undefined;
  clientId?: string;
  redirectUri?: string;
  /** Aantal dagen vóór verloop dat de banner mag verschijnen. Default 7. */
  warningDays?: number;
}

/**
 * Banner die boven de detail-tabs verschijnt zodra een OAuth-token binnen
 * `warningDays` verloopt. Knop start de OAuth-flow opnieuw via de bestaande
 * exact-oauth-start edge-function. Andere providers krijgen voorlopig dezelfde
 * Exact-flow als ze hetzelfde patroon gebruiken; de hook accepteert provider
 * als string-arg zodat dat later geüpgradet kan worden.
 */
export function TokenExpiryBanner({
  provider,
  expiresAt,
  clientId,
  redirectUri,
  warningDays = 7,
}: Props) {
  const { tenant } = useTenant();

  const status = useMemo(() => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt).getTime();
    if (Number.isNaN(expiry)) return null;
    const diffMs = expiry - Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (diffMs <= 0) {
      return { tone: "danger" as const, daysLeft: 0 };
    }
    const daysLeft = Math.ceil(diffMs / dayMs);
    if (daysLeft <= warningDays) {
      return { tone: "warning" as const, daysLeft };
    }
    return null;
  }, [expiresAt, warningDays]);

  if (!status) return null;

  const isExpired = status.tone === "danger";
  const headline = isExpired
    ? "OAuth-token verlopen"
    : status.daysLeft === 1
      ? "OAuth-token verloopt morgen"
      : `OAuth-token verloopt over ${status.daysLeft} dagen`;
  const sub = isExpired
    ? "Synchronisatie is gestopt tot je opnieuw verbindt."
    : "Vernieuw nu om onderbreking van de synchronisatie te voorkomen.";

  const refresh = async () => {
    if (!tenant) {
      toast.error("Geen tenant geladen");
      return;
    }
    if (provider !== "exact_online") {
      toast.info("Vernieuwen via OAuth is voorlopig alleen voor Exact Online", {
        description:
          "Open de Configuratie-tab van deze connector om handmatig te verbinden.",
      });
      return;
    }
    try {
      const url = await startExactOAuth({
        tenantId: tenant.id,
        clientId,
        redirectUri,
      });
      if (!url) {
        toast.error("Vul eerst Client ID en Redirect URI in op Configuratie");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Vernieuwen mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const palette =
    status.tone === "danger"
      ? "border-red-300 bg-red-50/80 text-red-800"
      : "border-amber-300 bg-amber-50/80 text-amber-900";

  return (
    <div
      className={`rounded-2xl border ${palette} px-4 py-3 flex items-start gap-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]`}
    >
      <span className="h-8 w-8 rounded-xl bg-white/80 flex items-center justify-center shrink-0">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold leading-tight">
          {headline}
        </p>
        <p className="text-xs leading-relaxed mt-0.5 opacity-90">{sub}</p>
      </div>
      <Button
        size="sm"
        onClick={refresh}
        className="gap-1.5 bg-white text-foreground hover:bg-white/90 border border-[hsl(var(--gold)/0.3)] shrink-0"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Vernieuw
      </Button>
    </div>
  );
}
