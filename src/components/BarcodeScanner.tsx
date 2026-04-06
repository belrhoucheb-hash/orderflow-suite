import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, ScanLine, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e: unknown) {
      setError("Camera toegang geweigerd. Sta camera-gebruik toe in je browser.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) startCamera();
    else stopCamera();
    return stopCamera;
  }, [isOpen, startCamera, stopCamera]);

  // Use BarcodeDetector API if available (Chrome, Edge, Android)
  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    // @ts-ignore - BarcodeDetector is not in all TS types
    if (!("BarcodeDetector" in window)) {
      // Fallback: manual code entry
      return;
    }

    // @ts-ignore
    const detector = new BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39"] });
    let animFrame: number;

    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animFrame = requestAnimationFrame(scan);
        return;
      }
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          const code = codes[0].rawValue;
          setScannedCode(code);
          onScan(code);
          stopCamera();
          return;
        }
      } catch {}
      animFrame = requestAnimationFrame(scan);
    };

    const timeout = setTimeout(() => { animFrame = requestAnimationFrame(scan); }, 500);
    return () => { clearTimeout(timeout); cancelAnimationFrame(animFrame); };
  }, [isOpen, onScan, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <h3 className="text-white font-semibold text-sm">Scan barcode of QR code</h3>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => { stopCamera(); onClose(); }}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Camera view */}
      <div className="relative w-full max-w-md aspect-[4/3] rounded-xl overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg" />
            {/* Animated scan line */}
            <div className="absolute left-2 right-2 h-0.5 bg-primary/80 animate-pulse" style={{ top: "50%", boxShadow: "0 0 8px 2px rgba(220,38,38,0.3)" }} />
          </div>
        </div>

        {/* Success overlay */}
        {scannedCode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
            <p className="text-white font-semibold text-sm">Gescand!</p>
            <p className="text-white/70 text-xs font-mono mt-1">{scannedCode}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-4 text-center px-4">{error}</p>
      )}

      {/* Manual entry fallback */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-white/50 text-xs">Of voer de code handmatig in:</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Barcode / QR code..."
            className="h-10 px-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary w-48"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) { setScannedCode(val); onScan(val); stopCamera(); }
              }
            }}
          />
          <Button size="sm" className="h-10" onClick={() => {
            const input = document.querySelector<HTMLInputElement>("input[placeholder*='Barcode']");
            if (input?.value.trim()) { setScannedCode(input.value.trim()); onScan(input.value.trim()); stopCamera(); }
          }}>
            Bevestig
          </Button>
        </div>
      </div>
    </div>
  );
}
