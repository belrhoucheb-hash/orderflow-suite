import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Globe } from "lucide-react";
import { toast } from "sonner";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import { PORTAL_MODULE_LABELS } from "@/types/clientPortal";
import type { PortalModule } from "@/types/clientPortal";

const ALL_MODULES: PortalModule[] = ["orders", "tracking", "documents", "invoicing", "reporting", "settings"];

interface PortalConfig {
  enabled: boolean;
  modules: Record<PortalModule, boolean>;
}

const DEFAULT_CONFIG: PortalConfig = {
  enabled: true,
  modules: {
    orders: true,
    tracking: true,
    documents: true,
    invoicing: true,
    reporting: true,
    settings: true,
  },
};

export function PortalModuleToggle() {
  const { data: saved, isLoading } = useLoadSettings<PortalConfig>("general");
  const saveSettings = useSaveSettings("general");

  const [config, setConfig] = useState<PortalConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (saved && (saved as any).portal) {
      setConfig((saved as any).portal);
    }
  }, [saved]);

  const handleToggleModule = (mod: PortalModule) => {
    setConfig((prev) => ({
      ...prev,
      modules: { ...prev.modules, [mod]: !prev.modules[mod] },
    }));
  };

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync({
        ...((saved as any) ?? {}),
        portal: config,
      });
      toast.success("Portaalinstellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan");
    }
  };

  if (isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-400" />
              Klantportaal configuratie
            </CardTitle>
            <CardDescription>Bepaal welke modules beschikbaar zijn in het klantportaal</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
            />
            <Label className="text-sm">{config.enabled ? "Portaal actief" : "Portaal inactief"}</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ALL_MODULES.map((mod) => (
          <div key={mod} className="flex items-center justify-between py-2">
            <Label className="text-sm">{PORTAL_MODULE_LABELS[mod]}</Label>
            <Switch
              checked={config.modules[mod]}
              onCheckedChange={() => handleToggleModule(mod)}
              disabled={!config.enabled}
            />
          </div>
        ))}
        <Button
          onClick={handleSave}
          disabled={saveSettings.isPending}
          className="gap-1.5"
        >
          {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Opslaan
        </Button>
      </CardContent>
    </Card>
  );
}

// Alias for plan compatibility
export { PortalModuleToggle as PortalSettingsSection };
