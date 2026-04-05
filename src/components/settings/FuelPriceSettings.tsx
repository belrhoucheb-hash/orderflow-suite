import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel, Save } from "lucide-react";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface FuelSettings {
  diesel_price_per_liter: number;
  last_updated: string;
}

export function FuelPriceSettings() {
  const { data: savedSettings } = useLoadSettings<FuelSettings>("fuel_price");
  const saveSettings = useSaveSettings("fuel_price");

  const [dieselPrice, setDieselPrice] = useState("1.85");

  useEffect(() => {
    if (savedSettings?.diesel_price_per_liter) {
      setDieselPrice(String(savedSettings.diesel_price_per_liter));
    }
  }, [savedSettings]);

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync({
        diesel_price_per_liter: parseFloat(dieselPrice),
        last_updated: new Date().toISOString(),
      } as any);
      toast.success("Brandstofprijs opgeslagen");
    } catch {
      toast.error("Fout bij opslaan brandstofprijs");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fuel className="h-5 w-5" />
          Brandstofprijs
        </CardTitle>
        <CardDescription>
          Stel de huidige dieselprijs in voor automatische kostprijsberekening per rit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 max-w-sm">
          <div className="flex-1">
            <Label htmlFor="diesel-price">Dieselprijs (EUR per liter)</Label>
            <Input
              id="diesel-price"
              type="number"
              step="0.01"
              min="0"
              value={dieselPrice}
              onChange={(e) => setDieselPrice(e.target.value)}
              placeholder="1.85"
            />
          </div>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" /> Opslaan
          </Button>
        </div>
        {savedSettings?.last_updated && (
          <p className="text-xs text-muted-foreground mt-2">
            Laatst bijgewerkt: {new Date(savedSettings.last_updated).toLocaleDateString("nl-NL")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
