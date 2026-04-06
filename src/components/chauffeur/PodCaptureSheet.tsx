import {
  MapPin,
  CheckCircle2,
  Navigation,
  Phone,
  Fingerprint,
  Camera,
  X,
  User,
  MessageSquare,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PodCaptureSheetProps {
  selectedOrder: any;
  isSigning: boolean;
  isSubmitting: boolean;
  podSignedBy: string;
  setPodSignedBy: (val: string) => void;
  podNotes: string;
  setPodNotes: (val: string) => void;
  podPhotos: string[];
  photoInputRef: React.RefObject<HTMLInputElement>;
  handlePhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removePhoto: (index: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  startDrawing: (e: React.MouseEvent | React.TouchEvent) => void;
  draw: (e: React.MouseEvent | React.TouchEvent) => void;
  stopDrawing: () => void;
  clearCanvas: () => void;
  startSigning: () => void;
  handleCompleteDelivery: () => void;
  resetPodState: () => void;
  onClose: () => void;
}

export function PodCaptureSheet({
  selectedOrder,
  isSigning,
  isSubmitting,
  podSignedBy,
  setPodSignedBy,
  podNotes,
  setPodNotes,
  podPhotos,
  photoInputRef,
  handlePhotoCapture,
  removePhoto,
  canvasRef,
  startDrawing,
  draw,
  stopDrawing,
  clearCanvas,
  startSigning,
  handleCompleteDelivery,
  resetPodState,
  onClose,
}: PodCaptureSheetProps) {
  if (!selectedOrder) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col justify-end backdrop-blur-sm">
      <div className="bg-white rounded-t-[32px] h-[92vh] w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
          <h3 className="font-bold text-xl text-slate-900 line-clamp-1">
            {selectedOrder.client_name}
          </h3>
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              resetPodState();
            }}
            className="rounded-full bg-slate-100/80 text-slate-600 hover:bg-slate-200"
          >
            Terug
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {/* Address card */}
          <div className="bg-blue-50/50 rounded-3xl p-5 mb-6 border border-blue-100/50">
            <p className="text-sm font-semibold text-blue-600 mb-1 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Afleveradres
            </p>
            <p className="text-slate-900 font-medium text-lg leading-snug mt-2">
              {selectedOrder.delivery_address}
            </p>
            <div className="flex gap-3 mt-5">
              <Button
                className="flex-1 rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm h-12"
                onClick={() => {
                  const encoded = encodeURIComponent(
                    selectedOrder.delivery_address || ""
                  );
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
                    "_blank"
                  );
                }}
              >
                <Navigation className="h-4 w-4 mr-2" /> Start Navigatie
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-12 w-12 rounded-2xl flex-shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"
              >
                <Phone className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {isSigning ? (
            <div className="flex-1 flex flex-col">
              {/* Step indicator */}
              <div className="flex items-center gap-3 mb-5 bg-slate-50 rounded-2xl p-3">
                <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900">
                    Proof of Delivery
                  </h4>
                  <p className="text-xs text-slate-500">
                    Laat de ontvanger tekenen en vul de gegevens in
                  </p>
                </div>
              </div>

              {/* Receiver name */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Naam ontvanger
                </label>
                <Input
                  value={podSignedBy}
                  onChange={(e) => setPodSignedBy(e.target.value)}
                  placeholder="Naam van de persoon die tekent..."
                  className="rounded-xl h-11 text-sm"
                />
              </div>

              {/* Signature canvas */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                  <Fingerprint className="h-3.5 w-3.5" /> Digitale handtekening
                </label>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-[20px] bg-slate-50 relative overflow-hidden shadow-inner"
                  style={{ height: 200 }}
                >
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={300}
                    className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ touchAction: "none" }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCanvas}
                  className="mt-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                  Wis handtekening
                </Button>
              </div>

              {/* Photo upload */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Foto-bewijs (optioneel,
                  max 4)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {podPhotos.map((photo, i) => (
                    <div
                      key={i}
                      className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200"
                    >
                      <img
                        src={photo}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {podPhotos.length < 4 && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-colors"
                    >
                      <Camera className="h-5 w-5 mb-0.5" />
                      <span className="text-xs font-medium">Foto</span>
                    </button>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Opmerkingen
                  (optioneel)
                </label>
                <Textarea
                  value={podNotes}
                  onChange={(e) => setPodNotes(e.target.value)}
                  placeholder="Schade, afwijkingen, bijzonderheden..."
                  className="rounded-xl text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Submit button */}
              <div className="mt-auto pb-4">
                <Button
                  onClick={handleCompleteDelivery}
                  disabled={isSubmitting}
                  className="w-full rounded-[20px] bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 h-14 font-semibold text-lg transition-transform active:scale-95"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Bezig met opslaan...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Aflevering bevestigen
                    </span>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-8 pb-4">
              <Button
                onClick={startSigning}
                className="w-full h-16 rounded-[20px] text-lg font-bold shadow-xl shadow-primary/20 transition-transform active:scale-95"
              >
                <Fingerprint className="h-5 w-5 mr-2" />
                Proof of Delivery (Teken)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Separate component for viewing delivered PoD
interface PodViewerProps {
  viewingPod: any;
  onClose: () => void;
}

export function PodViewer({ viewingPod, onClose }: PodViewerProps) {
  if (!viewingPod) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col justify-end backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-[32px] max-h-[80vh] w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {viewingPod.client_name}
            </h3>
            <p className="text-xs text-emerald-600 font-medium">
              Afgeleverd &#10003;
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={onClose}
            className="rounded-full bg-slate-100/80 text-slate-600 hover:bg-slate-200"
          >
            Sluiten
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Signature */}
          {viewingPod.pod_signature_url && (
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                Handtekening
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <img
                  src={viewingPod.pod_signature_url}
                  alt="Handtekening"
                  className="w-full max-h-40 object-contain"
                />
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-2">
            {viewingPod.pod_signed_by && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-slate-400" />
                <span>
                  Getekend door: <strong>{viewingPod.pod_signed_by}</strong>
                </span>
              </div>
            )}
            {viewingPod.pod_signed_at && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>
                  {new Date(viewingPod.pod_signed_at).toLocaleString("nl-NL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {viewingPod.pod_notes && (
              <div className="flex items-start gap-2 text-sm text-slate-600">
                <MessageSquare className="h-4 w-4 mt-0.5 text-slate-400" />
                <span className="italic">"{viewingPod.pod_notes}"</span>
              </div>
            )}
          </div>

          {/* Photos */}
          {Array.isArray(viewingPod.pod_photos) &&
            viewingPod.pod_photos.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                  Foto-bewijs ({viewingPod.pod_photos.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {viewingPod.pod_photos.map((url: string, i: number) => (
                    <div
                      key={i}
                      className="aspect-square rounded-xl overflow-hidden border border-slate-200"
                    >
                      <img
                        src={url}
                        alt={`PoD foto ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
