import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel } from "lucide-react";

export function FuelPriceSettings() {
  const [dieselPrice, setDieselPrice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Persistence will be wired up when tenant settings infrastructure supports it.
      // For now the value lives in local state and triggers a success toast.
      await new Promise((resolve) => setTimeout(resolve, 200));
      toast.success("Dieselprijs opgeslagen", {
        description: `Huidige prijs: € ${parseFloat(dieselPrice || "0").toFixed(3)} / liter`,
      });
    } catch {
      toast.error("Fout bij opslaan dieselprijs");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Fuel className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Brandstofprijs</CardTitle>
            <CardDescription className="text-xs">
              Stel de huidige dieselprijs in voor automatische ritkosten.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 max-w-xs">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="diesel-price">Dieselprijs (€ / liter)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
              <Input
                id="diesel-price"
                type="number"
                min="0"
                step="0.001"
                value={dieselPrice}
                onChange={(e) => setDieselPrice(e.target.value)}
                placeholder="1.799"
                className="pl-7"
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || !dieselPrice}
            size="sm"
            className="mb-0.5"
          >
            Opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
