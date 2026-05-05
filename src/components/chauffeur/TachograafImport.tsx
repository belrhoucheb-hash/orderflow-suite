import { useRef, useState } from "react";
import { Nfc, Upload, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { IconBubble } from "@/components/chauffeur/IconBubble";
import { supabase } from "@/integrations/supabase/client";

interface TachographImportRow {
  id: string;
  file_name: string | null;
  status: "RECEIVED" | "PARSING" | "PARSED" | "FAILED";
  created_at: string;
}

interface Props {
  driverId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function statusLabel(status: TachographImportRow["status"]): { text: string; variant: "success" | "warn" | "danger" } {
  switch (status) {
    case "PARSED":
      return { text: "verwerkt", variant: "success" };
    case "RECEIVED":
    case "PARSING":
      return { text: "in behandeling", variant: "warn" };
    case "FAILED":
      return { text: "fout bij verwerking", variant: "danger" };
  }
}

export function TachograafImport({ driverId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const recentImports = useQuery<TachographImportRow[]>({
    queryKey: ["tachograph_imports", driverId],
    enabled: !!driverId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tachograph_imports" as any)
        .select("id, file_name, status, created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as TachographImportRow[];
    },
  });

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
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bestand te groot, max 10 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("driver_id", driverId);
      const { data, error } = await supabase.functions.invoke("tachograph-import", {
        body: formData,
      });
      if (error) {
        toast.error("Upload mislukt", { description: error.message });
        return;
      }
      if (!data?.ok) {
        toast.error("Upload niet bevestigd", {
          description: data?.error ?? "Probeer opnieuw of neem contact op met de planner.",
        });
        return;
      }
      toast.success("Bestand ontvangen, wordt verwerkt door planner");
      await queryClient.invalidateQueries({ queryKey: ["tachograph_imports", driverId] });
    } catch (err) {
      toast.error("Upload mislukt", {
        description: err instanceof Error ? err.message : "Onbekende fout",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const imports = recentImports.data ?? [];

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
        {recentImports.isLoading ? (
          <p className="text-xs text-muted-foreground">Bezig met ophalen...</p>
        ) : imports.length === 0 ? (
          <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-4 text-center bg-card">
            <IconBubble icon={<Clock className="h-4 w-4" />} size={36} className="mx-auto" />
            <p className="text-xs text-muted-foreground mt-2">
              Nog geen tachograaf-bestanden geupload.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {imports.map((imp) => {
              const status = statusLabel(imp.status);
              const Icon =
                imp.status === "PARSED"
                  ? CheckCircle2
                  : imp.status === "FAILED"
                    ? AlertTriangle
                    : Clock;
              return (
                <div
                  key={imp.id}
                  className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 flex items-center gap-3 bg-card"
                >
                  <IconBubble
                    icon={<Icon className="h-4 w-4" strokeWidth={2.25} />}
                    size={36}
                    variant={status.variant}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-display truncate">
                      {imp.file_name ?? "tachograaf-bestand"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(imp.created_at)} · {status.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
