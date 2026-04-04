import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Search, Loader2, Image } from "lucide-react";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";

interface Document {
  id: string;
  order_id: string;
  order_number: number;
  type: string; // CMR, POD, LABEL, INVOICE
  file_url: string;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  CMR: "CMR Vrachtbrief",
  POD: "Afleveringsbewijs (POD)",
  LABEL: "Verzendlabel",
  INVOICE: "Factuur",
};

export default function PortalDocuments() {
  const { data: portalUser } = useCurrentPortalUser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);

      // Fetch POD documents from proof_of_delivery table via orders
      const { data: pods, error: podErr } = await supabase
        .from("proof_of_delivery" as any)
        .select("id, trip_stop_id, photo_url, signature_url, created_at, trip_stops!inner(order_id, orders!inner(order_number, client_id))")
        .eq("trip_stops.orders.client_id", portalUser!.client_id);

      // Build documents list from available sources
      const docs: Document[] = [];

      if (pods && !podErr) {
        for (const pod of pods as any[]) {
          const orderNum = pod.trip_stops?.orders?.order_number;
          const orderId = pod.trip_stops?.order_id;
          if (pod.photo_url) {
            docs.push({
              id: `pod-photo-${pod.id}`,
              order_id: orderId,
              order_number: orderNum,
              type: "POD",
              file_url: pod.photo_url,
              created_at: pod.created_at,
            });
          }
          if (pod.signature_url) {
            docs.push({
              id: `pod-sig-${pod.id}`,
              order_id: orderId,
              order_number: orderNum,
              type: "POD",
              file_url: pod.signature_url,
              created_at: pod.created_at,
            });
          }
        }
      }

      // Sort by date descending
      docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setDocuments(docs);
      setLoading(false);
    };

    load();
  }, [portalUser?.client_id]);

  const filtered = search
    ? documents.filter(
        (d) =>
          d.order_number?.toString().includes(search) ||
          DOC_TYPE_LABELS[d.type]?.toLowerCase().includes(search.toLowerCase())
      )
    : documents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documenten</h1>
        <p className="text-gray-500 mt-1">Download CMR, POD, labels en facturen</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op ordernummer of documenttype..."
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Geen documenten gevonden</p>
              <p className="text-gray-400 text-sm mt-1">
                Documenten worden beschikbaar zodra zendingen zijn afgeleverd.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    {doc.type === "POD" ? (
                      <Image className="h-5 w-5 text-blue-600" />
                    ) : (
                      <FileText className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      Order #{doc.order_number} &middot;{" "}
                      {new Date(doc.created_at).toLocaleDateString("nl-NL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(doc.file_url, "_blank")}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
