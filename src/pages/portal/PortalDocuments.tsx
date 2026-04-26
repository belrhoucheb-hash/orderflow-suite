import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  Download,
  Search,
  Loader2,
  Image,
  Receipt,
  ScrollText,
  Barcode,
  Paperclip,
} from "lucide-react";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";

interface Document {
  id: string;
  order_id: string | null;
  order_number: number | null;
  type: "CMR" | "POD" | "LABEL" | "INVOICE" | "ATTACHMENT";
  file_url: string;
  created_at: string;
  source_label?: string;
}

interface OrderAttachment {
  name?: string;
  url?: string;
  type?: string;
}

const DOC_TYPE_LABELS: Record<Document["type"], string> = {
  CMR: "CMR Vrachtbrief",
  POD: "Afleveringsbewijs (POD)",
  LABEL: "Verzendlabel",
  INVOICE: "Factuur",
  ATTACHMENT: "Orderbijlage",
};

function inferDocumentType(attachment: OrderAttachment): Document["type"] {
  const haystack = `${attachment.name ?? ""} ${attachment.type ?? ""}`.toLowerCase();
  if (haystack.includes("cmr")) return "CMR";
  if (haystack.includes("label") || haystack.includes("zpl") || haystack.includes("barcode")) {
    return "LABEL";
  }
  if (haystack.includes("pod") || haystack.includes("signature")) return "POD";
  return "ATTACHMENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAttachmentList(value: unknown): OrderAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    name: typeof item.name === "string" ? item.name : undefined,
    url: typeof item.url === "string" ? item.url : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
  }));
}

function DocumentIcon({ type }: { type: Document["type"] }) {
  switch (type) {
    case "POD":
      return <Image className="h-5 w-5 text-blue-600" />;
    case "INVOICE":
      return <Receipt className="h-5 w-5 text-blue-600" />;
    case "CMR":
      return <ScrollText className="h-5 w-5 text-blue-600" />;
    case "LABEL":
      return <Barcode className="h-5 w-5 text-blue-600" />;
    default:
      return <Paperclip className="h-5 w-5 text-blue-600" />;
  }
}

export default function PortalDocuments() {
  const { data: portalUser } = useCurrentPortalUser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);

      const { data: clientOrders } = await supabase
        .from("orders")
        .select("id, order_number, created_at, attachments")
        .eq("client_id", portalUser.client_id);

      const docs: Document[] = [];
      const orderIds = (clientOrders ?? []).map((o) => o.id);
      const orderMap = new Map((clientOrders ?? []).map((o) => [o.id, o.order_number]));

      if (orderIds.length > 0) {
        const { data: pods, error: podErr } = await supabase
          .from("proof_of_delivery" as any)
          .select("id, order_id, photos, signature_url, created_at")
          .in("order_id", orderIds);

        if (pods && !podErr) {
          for (const pod of pods as any[]) {
            const orderNum = orderMap.get(pod.order_id) ?? null;
            const photoUrls = Array.isArray(pod.photos) ? pod.photos : [];
            for (const url of photoUrls) {
              if (typeof url === "string" && url) {
                docs.push({
                  id: `pod-photo-${pod.id}-${url}`,
                  order_id: pod.order_id,
                  order_number: orderNum,
                  type: "POD",
                  file_url: url,
                  created_at: pod.created_at,
                  source_label: "POD foto",
                });
              }
            }
            if (typeof pod.signature_url === "string" && pod.signature_url) {
              docs.push({
                id: `pod-sig-${pod.id}`,
                order_id: pod.order_id,
                order_number: orderNum,
                type: "POD",
                file_url: pod.signature_url,
                created_at: pod.created_at,
                source_label: "Handtekening",
              });
            }
          }
        }

        for (const order of clientOrders ?? []) {
          const attachments = toAttachmentList(order.attachments);
          for (const attachment of attachments) {
            if (!attachment.url) continue;
            docs.push({
              id: `order-attachment-${order.id}-${attachment.url}`,
              order_id: order.id,
              order_number: order.order_number,
              type: inferDocumentType(attachment),
              file_url: attachment.url,
              created_at: order.created_at,
              source_label: attachment.name ?? "Orderbijlage",
            });
          }
        }
      }

      const { data: invoices, error: invoiceErr } = await supabase
        .from("invoices" as any)
        .select("id, client_id, invoice_number, invoice_date, pdf_url")
        .eq("client_id", portalUser.client_id)
        .not("pdf_url", "is", null);

      if (invoices && !invoiceErr) {
        for (const invoice of invoices as any[]) {
          if (typeof invoice.pdf_url !== "string" || !invoice.pdf_url) continue;
          docs.push({
            id: `invoice-${invoice.id}`,
            order_id: null,
            order_number: null,
            type: "INVOICE",
            file_url: invoice.pdf_url,
            created_at: invoice.invoice_date,
            source_label: invoice.invoice_number,
          });
        }
      }

      docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDocuments(docs);
      setLoading(false);
    };

    load();
  }, [portalUser?.client_id]);

  const filtered = search
    ? documents.filter((d) => {
        const haystack = [
          d.order_number?.toString() ?? "",
          DOC_TYPE_LABELS[d.type],
          d.source_label ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : documents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documenten</h1>
        <p className="text-gray-500 mt-1">
          Bekijk facturen, POD-bestanden en orderdocumenten zoals labels of extra bijlagen zodra ze beschikbaar zijn
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op ordernummer, documenttype of bestandsnaam..."
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
                Documenten verschijnen zodra er POD, facturen of orderbijlagen beschikbaar zijn.
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
                    <DocumentIcon type={doc.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {DOC_TYPE_LABELS[doc.type]}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {doc.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      {doc.order_number ? `Order #${doc.order_number}` : "Facturatiedossier"}
                      {doc.source_label ? ` · ${doc.source_label}` : ""}
                      {" · "}
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
                    Open
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
