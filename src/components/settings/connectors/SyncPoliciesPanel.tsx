import { Switch } from "@/components/ui/switch";
import { Radio, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useEventPolicies, useSaveEventPolicy } from "@/hooks/useConnectors";
import { findConnector } from "@/lib/connectors/catalog";

interface Props {
  slug: string;
}

/**
 * Toon per supported event van de connector een aan/uit-Switch. De waarden
 * worden in connector_event_policies opgeslagen. Een ontbrekende rij wordt
 * als 'enabled = true' beschouwd, zodat de tenant niets hoeft te doen om
 * push-events te ontvangen.
 */
export function SyncPoliciesPanel({ slug }: Props) {
  const connector = findConnector(slug);
  const policies = useEventPolicies(slug);
  const save = useSaveEventPolicy(slug);

  if (!connector) return null;
  if (connector.supportedEvents.length === 0) {
    return (
      <div className="card--luxe p-5">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-xl bg-[hsl(var(--gold-soft))] flex items-center justify-center text-[hsl(var(--gold-deep))] shrink-0">
            <Radio className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-display font-semibold text-foreground">
              Geen push-events
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Deze connector werkt op pull-basis. Synchronisatie regel je via
              de Sync nu-knop in de zijbalk.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleToggle = async (eventType: string, enabled: boolean) => {
    try {
      await save.mutateAsync({ eventType, enabled });
      toast.success(
        enabled
          ? `Event "${eventType}" geactiveerd`
          : `Event "${eventType}" gepauzeerd`,
      );
    } catch {
      // toast wordt al door de mutation getoond
    }
  };

  return (
    <div className="card--luxe p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
            Sync-policies
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Schakel per event-type aan of OrderFlow het naar deze connector
            mag pushen. Wijzigingen gaan direct in.
          </p>
        </div>
        {policies.isFetching && (
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0 mt-1" />
        )}
      </div>

      <div className="space-y-2">
        {connector.supportedEvents.map((event) => {
          const stored = policies.data?.[event];
          const enabled = stored ?? true;
          return (
            <div
              key={event}
              className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white px-3 py-2.5"
            >
              <div className="min-w-0">
                <code className="block text-xs font-mono text-foreground truncate">
                  {event}
                </code>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {enabled ? "Wordt actief gepushd" : "Gepauzeerd voor deze tenant"}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={save.isPending}
                onCheckedChange={(value) => void handleToggle(event, value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
