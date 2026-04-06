import { Truck, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Driver {
  id: string;
  name: string;
  current_vehicle_id?: string | null;
}

interface ChauffeurLoginScreenProps {
  drivers: Driver[];
  pendingDriverId: string | null;
  pinInput: string;
  setPinInput: (val: string) => void;
  pinError: string;
  setPinError: (val: string) => void;
  pinVerifying: boolean;
  pinLockedUntil: number | null;
  pinLockCountdown: number;
  handleDriverSelect: (driverId: string) => void;
  handlePinSubmit: () => void;
}

export function ChauffeurLoginScreen({
  drivers,
  pendingDriverId,
  pinInput,
  setPinInput,
  pinError,
  setPinError,
  pinVerifying,
  pinLockedUntil,
  pinLockCountdown,
  handleDriverSelect,
  handlePinSubmit,
}: ChauffeurLoginScreenProps) {
  // PIN INPUT SCREEN
  if (pendingDriverId) {
    const pendingDriver = drivers.find((d) => d.id === pendingDriverId);
    return (
      <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="h-16 w-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
              PIN invoeren
            </h1>
            <p className="text-muted-foreground mt-2">
              {pendingDriver?.name} - Voer je 4-cijferige PIN in
            </p>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ""));
                setPinError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePinSubmit();
              }}
              placeholder="----"
              className="text-center text-3xl tracking-[0.5em] font-mono h-16"
              disabled={!!pinLockedUntil && Date.now() < pinLockedUntil}
              autoFocus
            />

            {pinError && (
              <p className="text-sm text-red-500 text-center">{pinError}</p>
            )}
            {pinLockCountdown > 0 && (
              <p className="text-sm text-amber-600 text-center font-medium">
                Geblokkeerd: {Math.floor(pinLockCountdown / 60)}:
                {(pinLockCountdown % 60).toString().padStart(2, "0")} resterend
              </p>
            )}

            <Button
              className="w-full h-12 text-base"
              onClick={handlePinSubmit}
              disabled={
                pinInput.length !== 4 ||
                pinVerifying ||
                (!!pinLockedUntil && Date.now() < pinLockedUntil)
              }
            >
              {pinVerifying ? "Verifying..." : "Inloggen"}
            </Button>

            <button
              onClick={() => {
                handleDriverSelect(""); // triggers reset via parent
                // We re-use handleDriverSelect with empty to go back
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terug naar chauffeur selectie
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DRIVER SELECTION SCREEN
  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="h-16 w-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
            <Truck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
            OrderFlow PWA
          </h1>
          <p className="text-muted-foreground mt-2">
            Driver Portal - Selecteer je profiel
          </p>
        </div>

        <div className="space-y-3">
          {drivers.slice(0, 6).map((driver) => (
            <button
              key={driver.id}
              onClick={() => handleDriverSelect(driver.id)}
              className="w-full bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-4 hover:border-primary/50 hover:shadow-md transition-all active:scale-95"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {driver.name.charAt(0)}
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-slate-900">{driver.name}</h3>
                <p className="text-xs text-slate-500">
                  Voertuig:{" "}
                  {driver.current_vehicle_id
                    ? "Toegewezen"
                    : "Geen vrachtwagen"}
                </p>
              </div>
              <Fingerprint className="h-5 w-5 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
