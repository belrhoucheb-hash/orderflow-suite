import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ORDERFLOW_PIN_SALT = "orderflow-salt";

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + ORDERFLOW_PIN_SALT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function usePinAuth(onAuthenticated: (driverId: string) => void) {
  const [pendingDriverId, setPendingDriverId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);
  const [pinLockCountdown, setPinLockCountdown] = useState(0);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  // Lockout countdown timer
  useEffect(() => {
    if (!pinLockedUntil) {
      setPinLockCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.ceil((pinLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setPinLockedUntil(null);
        setPinLockCountdown(0);
        setPinAttempts(0);
      } else {
        setPinLockCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pinLockedUntil]);

  const handleDriverSelect = useCallback((driverId: string) => {
    setPendingDriverId(driverId);
    setPinInput("");
    setPinError("");
    setPinAttempts(0);
    setPinLockedUntil(null);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pinLockedUntil && Date.now() < pinLockedUntil) return;
    if (pinInput.length !== 4) {
      setPinError("PIN moet 4 cijfers zijn");
      return;
    }
    if (!pendingDriverId) return;

    setPinVerifying(true);
    try {
      const { data, error } = await supabase
        .from("drivers" as any)
        .select("pin_hash, must_change_pin")
        .eq("id", pendingDriverId)
        .single();

      if (error) throw error;

      const storedHash = (data as any)?.pin_hash;
      if (!storedHash) {
        setPinError("Geen PIN ingesteld voor deze chauffeur");
        setPinInput("");
        return;
      }

      const inputHash = await hashPin(pinInput);
      const isHashMatch = inputHash === storedHash;

      if (!isHashMatch) {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        if (newAttempts >= 3) {
          const lockUntil = Date.now() + 5 * 60 * 1000;
          setPinLockedUntil(lockUntil);
          setPinError("Te veel pogingen. Geblokkeerd voor 5 minuten.");
        } else {
          setPinError(`Onjuiste PIN. Nog ${3 - newAttempts} poging(en).`);
        }
        setPinInput("");
        return;
      }

      // PIN correct
      if ((data as any)?.must_change_pin) {
        setShowChangePin(true);
      } else {
        onAuthenticated(pendingDriverId);
        setPendingDriverId(null);
      }
    } catch {
      setPinError("Onjuiste PIN");
      setPinInput("");
    } finally {
      setPinVerifying(false);
    }
  }, [pinLockedUntil, pinInput, pendingDriverId, pinAttempts, onAuthenticated]);

  const handleChangePin = useCallback(async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinError("Nieuwe PIN moet 4 cijfers zijn");
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError("PIN-codes komen niet overeen");
      return;
    }
    try {
      const hashedNewPin = await hashPin(newPin);
      await supabase
        .from("drivers" as any)
        .update({ pin_hash: hashedNewPin, must_change_pin: false })
        .eq("id", pendingDriverId);

      toast.success("PIN succesvol gewijzigd");
      if (pendingDriverId) onAuthenticated(pendingDriverId);
      setPendingDriverId(null);
      setShowChangePin(false);
      setNewPin("");
      setConfirmNewPin("");
    } catch {
      setPinError("Kon PIN niet wijzigen. Probeer opnieuw.");
    }
  }, [newPin, confirmNewPin, pendingDriverId, onAuthenticated]);

  const resetPinState = useCallback(() => {
    setPendingDriverId(null);
    setPinInput("");
    setPinError("");
    setShowChangePin(false);
  }, []);

  return {
    pendingDriverId,
    pinInput,
    setPinInput,
    pinError,
    setPinError,
    pinVerifying,
    pinLockedUntil,
    pinLockCountdown,
    showChangePin,
    setShowChangePin,
    newPin,
    setNewPin,
    confirmNewPin,
    setConfirmNewPin,
    handleDriverSelect,
    handlePinSubmit,
    handleChangePin,
    resetPinState,
  };
}
