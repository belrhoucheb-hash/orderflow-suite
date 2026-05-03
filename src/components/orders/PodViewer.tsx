import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Image, Download, User, Clock, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPodFileUrl, isExternalPodUrl } from "@/lib/podStorage";

interface PodViewerProps {
  order: any;
  compact?: boolean;
}

const PodViewer: React.FC<PodViewerProps> = ({ order, compact = false }) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const hasSignature = !!order.pod_signature_url;
  const photos: string[] = Array.isArray(order.pod_photos) ? order.pod_photos : [];
  const [signatureUrl, setSignatureUrl] = useState<string | null>(
    isExternalPodUrl(order.pod_signature_url) ? order.pod_signature_url : null,
  );
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    photos.filter((photo) => isExternalPodUrl(photo)),
  );
  const hasPod = hasSignature || photos.length > 0;

  useEffect(() => {
    let cancelled = false;

    const resolveEvidence = async () => {
      const allEvidenceIsAlreadyRenderable =
        (!order.pod_signature_url || isExternalPodUrl(order.pod_signature_url))
        && photos.every((photo) => isExternalPodUrl(photo));

      if (allEvidenceIsAlreadyRenderable) {
        return;
      }

      const [resolvedSignature, resolvedPhotos] = await Promise.all([
        getPodFileUrl(order.pod_signature_url, { orderId: order.id, purpose: "view" }),
        Promise.all(
          photos.map((photo) => getPodFileUrl(photo, { orderId: order.id, purpose: "view" })),
        ),
      ]);

      if (!cancelled) {
        setSignatureUrl(resolvedSignature);
        setPhotoUrls(resolvedPhotos.filter((url): url is string => !!url));
      }
    };

    resolveEvidence();

    return () => {
      cancelled = true;
    };
  }, [order.id, order.pod_signature_url, order.pod_photos]);

  if (!hasPod && !order.pod_signed_by) return null;

  return (
    <div className={cn("rounded-xl border", compact ? "p-3" : "p-4", "bg-emerald-50/50 border-emerald-200/60")}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Image className="h-3.5 w-3.5 text-emerald-600" />
        </div>
        <h4 className="text-sm font-semibold text-emerald-900">Proof of Delivery</h4>
        <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 ml-auto">
          Bevestigd
        </Badge>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 mb-3">
        {order.pod_signed_by && (
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <User className="h-3 w-3" />
            <span>Getekend door: <strong>{order.pod_signed_by}</strong></span>
          </div>
        )}
        {order.pod_signed_at && (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <Clock className="h-3 w-3" />
            <span>{new Date(order.pod_signed_at).toLocaleString("nl-NL", {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit"
            })}</span>
          </div>
        )}
        {order.pod_notes && (
          <div className="flex items-start gap-2 text-xs text-emerald-600">
            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="italic">"{order.pod_notes}"</span>
          </div>
        )}
      </div>

      {/* Signature Preview */}
      {signatureUrl && (
        <div className="mb-3">
          <p className="text-xs text-emerald-600/70 uppercase font-semibold tracking-wider mb-1.5">Handtekening</p>
          <Dialog>
            <DialogTrigger asChild>
              <button className="block w-full max-w-[240px] bg-white border border-emerald-200 rounded-lg p-2 hover:shadow-md transition-shadow cursor-zoom-in">
                <img
                  src={signatureUrl}
                  alt="Handtekening ontvanger"
                  className="w-full h-auto"
                />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <div className="p-4">
                <h3 className="font-semibold mb-3">Digitale Handtekening</h3>
                <div className="bg-white border rounded-lg p-3">
                  <img src={signatureUrl} alt="Handtekening" className="w-full h-auto" />
                </div>
                {order.pod_signed_by && (
                  <p className="text-sm text-muted-foreground mt-2">Getekend door: {order.pod_signed_by}</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Photo Grid */}
      {photoUrls.length > 0 && (
        <div>
          <p className="text-xs text-emerald-600/70 uppercase font-semibold tracking-wider mb-1.5">Foto-bewijs ({photoUrls.length})</p>
          <div className="grid grid-cols-4 gap-2">
            {photoUrls.map((url, i) => (
              <Dialog key={i}>
                <DialogTrigger asChild>
                  <button className="aspect-square rounded-lg overflow-hidden border border-emerald-200 bg-white hover:shadow-md transition-shadow cursor-zoom-in">
                    <img src={url} alt={`PoD foto ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-lg p-0 overflow-hidden">
                  <img src={url} alt={`PoD foto ${i + 1}`} className="w-full h-auto" />
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </div>
      )}

      {/* Download all */}
      {(signatureUrl || photoUrls.length > 0) && !compact && (
        <div className="mt-3 pt-3 border-t border-emerald-200/60">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            onClick={() => {
              // Download signature
              if (signatureUrl) {
                const a = document.createElement("a");
                a.href = signatureUrl;
                a.download = `pod-signature-${order.order_number}.png`;
                a.click();
              }
            }}
          >
            <Download className="h-3 w-3" />
            Download PoD
          </Button>
        </div>
      )}
    </div>
  );
};

export default PodViewer;
