import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { savePendingPOD, getPendingPODs, syncPendingPODs } from "@/lib/offlineStore";

export function usePodCapture(onDeliveryComplete?: () => void) {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [podSignedBy, setPodSignedBy] = useState("");
  const [podNotes, setPodNotes] = useState("");
  const [podPhotos, setPodPhotos] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [viewingPod, setViewingPod] = useState<any | null>(null);

  // Offline POD state
  const [pendingPODCount, setPendingPODCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const resetPodState = useCallback(() => {
    setPodSignedBy("");
    setPodNotes("");
    setPodPhotos([]);
    setIsSigning(false);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingPODs();
      setPendingPODCount(pending.length);
    } catch {
      // IndexedDB not available
    }
  }, []);

  const handleSyncPending = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncPendingPODs();
      if (result.synced > 0) {
        toast.success(`${result.synced} POD(s) gesynchroniseerd`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} POD(s) konden niet worden gesynchroniseerd`);
      }
      await refreshPendingCount();
    } catch {
      toast.error("Synchronisatie mislukt");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  // -- Photo handling --
  const handlePhotoCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      Array.from(files).forEach((file) => {
        if (podPhotos.length >= 4) {
          toast.error("Maximaal 4 foto's toegestaan");
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setPodPhotos((prev) => [...prev, dataUrl]);
        };
        reader.readAsDataURL(file);
      });

      if (photoInputRef.current) photoInputRef.current.value = "";
    },
    [podPhotos.length]
  );

  const removePhoto = useCallback((index: number) => {
    setPodPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // -- Signature Canvas Logic --
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ("touches" in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
        y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCanvasPoint(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      setIsDrawing(true);
    },
    [getCanvasPoint]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCanvasPoint(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCanvasPoint]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const isCanvasEmpty = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) return false;
    }
    return true;
  }, []);

  // -- Upload signature to Supabase Storage --
  const uploadSignature = useCallback(
    async (orderId: string): Promise<string | null> => {
      const canvas = canvasRef.current;
      if (!canvas || isCanvasEmpty()) return null;

      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }

          const fileName = `signatures/${orderId}-${Date.now()}.png`;
          const { error: uploadError } = await supabase.storage
            .from("pod-files")
            .upload(fileName, blob, { contentType: "image/png", upsert: true });

          if (uploadError) {
            console.error("Signature upload error:", uploadError);
            resolve(null);
            return;
          }

          const { data: urlData } = supabase.storage
            .from("pod-files")
            .getPublicUrl(fileName);

          resolve(urlData?.publicUrl || null);
        }, "image/png");
      });
    },
    [isCanvasEmpty]
  );

  // -- Upload photos to Supabase Storage --
  const uploadPhotos = useCallback(
    async (orderId: string): Promise<string[]> => {
      const urls: string[] = [];

      for (let i = 0; i < podPhotos.length; i++) {
        const dataUrl = podPhotos[i];
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        const fileName = `photos/${orderId}-${Date.now()}-${i}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("pod-files")
          .upload(fileName, blob, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error("Photo upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("pod-files")
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      }

      return urls;
    },
    [podPhotos]
  );

  // -- Complete delivery with full PoD --
  const handleCompleteDelivery = useCallback(async () => {
    if (!selectedOrder) return;
    if (isCanvasEmpty() && !podSignedBy) {
      toast.error("Laat de ontvanger tekenen of vul een naam in");
      return;
    }

    setIsSubmitting(true);
    try {
      const signatureUrl = await uploadSignature(selectedOrder.id);
      const photoUrls = await uploadPhotos(selectedOrder.id);

      const { error } = await supabase
        .from("orders" as any)
        .update({
          status: "DELIVERED",
          pod_signature_url: signatureUrl,
          pod_photos: photoUrls,
          pod_signed_by: podSignedBy || null,
          pod_signed_at: new Date().toISOString(),
          pod_notes: podNotes || null,
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      toast.success("Zending succesvol afgeleverd!", {
        description: "Handtekening en bewijs zijn opgeslagen.",
      });
      resetPodState();
      setSelectedOrder(null);
      onDeliveryComplete?.();
    } catch (err) {
      console.error("Online POD submit failed, saving offline:", err);

      try {
        const canvas = canvasRef.current;
        const signatureDataUrl =
          canvas && !isCanvasEmpty() ? canvas.toDataURL("image/png") : "";

        await savePendingPOD({
          id: `pod-${selectedOrder.id}-${Date.now()}`,
          tripStopId: selectedOrder._tripStopId || selectedOrder.id,
          orderId: selectedOrder.id,
          recipientName: podSignedBy || "",
          signatureDataUrl,
          photoDataUrls: [...podPhotos],
          notes: podNotes || "",
          createdAt: new Date().toISOString(),
        });

        await refreshPendingCount();

        toast.info("Opgeslagen offline, wordt gesynchroniseerd bij verbinding", {
          icon: "📴",
          duration: 5000,
        });
        resetPodState();
        setSelectedOrder(null);
      } catch (offlineErr) {
        console.error("Offline save also failed:", offlineErr);
        toast.error("Kon aflevering niet voltooien en niet offline opslaan.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedOrder,
    isCanvasEmpty,
    podSignedBy,
    podNotes,
    podPhotos,
    uploadSignature,
    uploadPhotos,
    resetPodState,
    refreshPendingCount,
    onDeliveryComplete,
  ]);

  const startSigning = useCallback(() => {
    setIsSigning(true);
    setTimeout(() => clearCanvas(), 150);
  }, [clearCanvas]);

  return {
    // Order selection
    selectedOrder,
    setSelectedOrder,
    viewingPod,
    setViewingPod,

    // Signing state
    isSigning,
    isSubmitting,
    startSigning,

    // PoD fields
    podSignedBy,
    setPodSignedBy,
    podNotes,
    setPodNotes,
    podPhotos,
    photoInputRef,
    handlePhotoCapture,
    removePhoto,

    // Canvas
    canvasRef,
    startDrawing,
    draw,
    stopDrawing,
    clearCanvas,

    // Delivery
    handleCompleteDelivery,
    resetPodState,

    // Offline sync
    pendingPODCount,
    isSyncing,
    refreshPendingCount,
    handleSyncPending,
  };
}
