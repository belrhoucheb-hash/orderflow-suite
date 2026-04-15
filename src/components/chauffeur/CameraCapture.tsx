import { useEffect, useRef, useState } from "react";
import { Camera, X, RotateCcw, Check } from "lucide-react";

interface Props {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
  label?: string;
}

/**
 * Live camera capture via getUserMedia. Forceert camera-stream, valt nooit
 * terug op bestandskiezer. HTTPS of localhost vereist (browser-restrictie).
 */
export function CameraCapture({ onCapture, onCancel, label }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera-toegang geweigerd. Geef toestemming in je browser-instellingen."
            : "Kon camera niet openen: " + (e?.message ?? String(e)),
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    // Resize naar max 1920px lange zijde, behoud aspect ratio.
    const MAX = 1920;
    const longest = Math.max(srcW, srcH);
    const scale = longest > MAX ? MAX / longest : 1;
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, dstW, dstH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        previewBlobRef.current = blob;
        setPreview(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.85,
    );
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    previewBlobRef.current = null;
  };

  const confirm = () => {
    if (previewBlobRef.current) {
      onCapture(previewBlobRef.current);
      if (preview) URL.revokeObjectURL(preview);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: "hsl(0 0% 0% / 0.6)",
          borderBottom: "1px solid hsl(var(--gold) / 0.3)",
        }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-light))] font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {label ?? "Foto maken"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 w-9 rounded-full flex items-center justify-center"
          style={{
            background: "hsl(0 0% 0% / 0.4)",
            border: "1px solid hsl(var(--gold) / 0.4)",
            color: "hsl(var(--gold-light))",
          }}
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {error ? (
          <div className="text-white text-sm text-center px-6 max-w-sm">
            {error}
          </div>
        ) : preview ? (
          <img src={preview} alt="Preview" className="max-h-full max-w-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div
        className="px-4 py-5 flex items-center justify-center gap-6"
        style={{
          background: "hsl(0 0% 0% / 0.75)",
          borderTop: "1px solid hsl(var(--gold) / 0.3)",
        }}
      >
        {preview ? (
          <>
            <button
              type="button"
              onClick={retake}
              className="btn-luxe"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <RotateCcw className="h-4 w-4" />
              Opnieuw
            </button>
            <button
              type="button"
              onClick={confirm}
              className="btn-luxe btn-luxe--primary"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <Check className="h-4 w-4" />
              Gebruik deze
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={snap}
            disabled={!!error}
            className="h-16 w-16 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background:
                "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
              border: "3px solid hsl(0 0% 100% / 0.9)",
              boxShadow:
                "0 0 0 2px hsl(var(--gold) / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.3)",
            }}
            aria-label="Foto maken"
          >
            <Camera className="h-7 w-7 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
