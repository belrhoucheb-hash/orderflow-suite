import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChauffeurPinChangeProps {
  driverName: string;
  newPin: string;
  setNewPin: (val: string) => void;
  confirmNewPin: string;
  setConfirmNewPin: (val: string) => void;
  pinError: string;
  setPinError: (val: string) => void;
  handleChangePin: () => void;
}

export function ChauffeurPinChange({
  driverName,
  newPin,
  setNewPin,
  confirmNewPin,
  setConfirmNewPin,
  pinError,
  setPinError,
  handleChangePin,
}: ChauffeurPinChangeProps) {
  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-16 w-16 bg-amber-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-amber-500/30 mb-6">
            <Fingerprint className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            PIN wijzigen
          </h1>
          <p className="text-muted-foreground mt-2">
            Welkom {driverName}! Stel een nieuwe PIN in.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Nieuwe PIN (4 cijfers)
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => {
                setNewPin(e.target.value.replace(/\D/g, ""));
                setPinError("");
              }}
              placeholder="----"
              className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Bevestig PIN
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmNewPin}
              onChange={(e) => {
                setConfirmNewPin(e.target.value.replace(/\D/g, ""));
                setPinError("");
              }}
              placeholder="----"
              className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
            />
          </div>
          {pinError && (
            <p className="text-sm text-red-500 text-center">{pinError}</p>
          )}
          <Button
            className="w-full h-12 text-base"
            onClick={handleChangePin}
            disabled={newPin.length !== 4 || confirmNewPin.length !== 4}
          >
            PIN opslaan
          </Button>
        </div>
      </div>
    </div>
  );
}
