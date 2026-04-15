import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  TRACKABLE_FIELDS,
  defaultExpectedBy,
} from "@/hooks/useOrderInfoRequests";

interface Props {
  orderId: string;
  tenantId: string;
  pickupAtIso?: string | null;
  onDone?: () => void;
}

export function FollowFromClientPopover({ orderId, tenantId, pickupAtIso, onDone }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = TRACKABLE_FIELDS.filter((f) => checked[f.name]);

  const reset = () => {
    setChecked({});
    setContactName("");
    setContactEmail("");
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      toast.error("Selecteer minstens één veld");
      return;
    }
    if (!tenantId) {
      toast.error("Geen tenant actief");
      return;
    }
    setSubmitting(true);
    const expected_by = defaultExpectedBy(pickupAtIso);
    const promised_at = new Date().toISOString();
    const rows = selected.map((f) => ({
      tenant_id: tenantId,
      order_id: orderId,
      field_name: f.name,
      field_label: f.label,
      status: "PENDING",
      promised_by_name: contactName.trim() || null,
      promised_by_email: contactEmail.trim() || null,
      promised_at,
      expected_by,
    }));

    const { error } = await (supabase as any)
      .from("order_info_requests")
      .insert(rows);

    setSubmitting(false);

    if (error) {
      if (String(error.message || "").includes("duplicate")) {
        toast.error("Eén of meer velden staan al open");
      } else {
        toast.error(error.message || "Kon niet toevoegen");
      }
      return;
    }

    toast.success(
      selected.length === 1
        ? `"${selected[0].label}" toegevoegd aan rappellijst`
        : `${selected.length} velden toegevoegd aan rappellijst`
    );
    qc.invalidateQueries({ queryKey: ["order_info_requests", orderId] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["order", orderId] });
    reset();
    setOpen(false);
    onDone?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-amber-800 hover:text-amber-900 underline-offset-2 hover:underline inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Volgt van klant
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">
            Welke info volgt nog van klant?
          </p>
          <div className="space-y-1.5">
            {TRACKABLE_FIELDS.map((f) => (
              <div key={f.name} className="flex items-center gap-2">
                <Checkbox
                  id={`ffc-${f.name}`}
                  checked={!!checked[f.name]}
                  onCheckedChange={(v) =>
                    setChecked((prev) => ({ ...prev, [f.name]: v === true }))
                  }
                />
                <Label
                  htmlFor={`ffc-${f.name}`}
                  className="text-xs font-normal cursor-pointer"
                >
                  {f.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contactpersoon (optioneel)"
            className="h-8 text-xs"
          />
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="email@klant.nl (optioneel)"
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Annuleren
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={handleSubmit}
            disabled={submitting || selected.length === 0}
          >
            Toevoegen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
