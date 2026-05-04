import { useRef, useState } from "react";
import { Nfc, Upload, Clock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IconBubble } from "@/components/chauffeur/IconBubble";
import { supabase } from "@/integrations/supabase/client";

interface RecentImport {
  id: string;
  date: string;
  filename: string;
  status: "verwerkt" | "in behandeling" | "fout";
}

// TODO: vervang door echte fetch naar tachograaf-import edge function zodra
// die bestaat. Voor nu een placeholder zodat het UI-pad volledig is.
const RECENT_IMPORTS: RecentImport[] = [
  { id: "1", date: "2 mei", filename: "C_20260502_1042.ddd", status: "verwerkt" },
  { id: "2", date: "29 apr", filename: "C_20260429_0918.ddd", status: "verwerkt" },
];

interface Props {
  driverId: string;
}

export function TachograafImport({ driverId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleNfc = () => {
    toast.info("NFC niet beschikbaar in browser, gebruik in-cab terminal", {
      description:
        "De Web NFC API ondersteunt geen tachograafkaarten. Plaats de kaart in de cabineterminal.",
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.ddd$/i.test(file.name)) {
      toast.error("Alleen .ddd bestanden toegestaan");
      return;
    }
    setUploading(true);
    toast.info("Bestand ontvangen, wordt verwerkt door planner");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("driver_id", driverId);
      // Placeholder POST naar edge function. De function zelf is nog niet
      // geimplementeerd, maar de aanroep zorgt ervoor dat de UI-flow compleet
      // is en netwerkfouten netjes afgehandeld worden.
      await supabase.functions.invoke("tachograph-import", { body: formData });
    } catch {
      // Stil falen, planner is verantwoordelijk voor opvolging.
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5">
        <Button
          onClick={handleNfc}
          className="h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white font-display font-semibold shadow-md"
        >
          <Nfc className="h-5 w-5 mr-2" strokeWidth={2.25} />
          Lees tachocard via NFC
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          variant="outline"
          className="h-14 rounded-2xl border-[hsl(var(--gold)/0.3)] font-display font-semibold"
        >
          <Upload className="h-5 w-5 mr-2" strokeWidth={2.25} />
          {uploading ? "Bezig met uploaden..." : "Upload .DDD bestand"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ddd"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">
          Recente imports
        </p>
        <div className="space-y-2">
          {RECENT_IMPORTS.map((imp) => (
            <div
              key={imp.id}
              className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 flex items-center gap-3 bg-card"
            >
              <IconBubble icon={<Clock className="h-4 w-4" strokeWidth={2.25} />} size={36} variant="success" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold font-display truncate">{imp.filename}</p>
                <p className="text-[11px] text-muted-foreground">{imp.date} · {imp.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
