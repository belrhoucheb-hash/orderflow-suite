import { supabase } from "@/integrations/supabase/client";

export const POD_BUCKET = "pod-files";

type PodFileKind = "signature" | "photo" | "cmr";

interface UploadPodBlobOptions {
  orderId: string;
  kind: PodFileKind;
  contentType: string;
  extension: "png" | "jpg" | "jpeg" | "pdf";
}

interface PodSignedUrlOptions {
  orderId?: string | null;
  purpose?: "view" | "download" | "cmr";
}

export function isExternalPodUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(https?:|data:|blob:)/i.test(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "unknown";
}

async function getTenantId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const tenantId = data.session?.user?.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new Error("POD upload requires an authenticated tenant session");
  }

  return tenantId;
}

export async function createPodStoragePath(
  orderId: string,
  kind: PodFileKind,
  extension: "png" | "jpg" | "jpeg" | "pdf",
): Promise<string> {
  const tenantId = await getTenantId();
  const folder = kind === "signature" ? "signatures" : kind === "cmr" ? "cmr" : "photos";
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${tenantId}/${folder}/${safeSegment(orderId)}-${id}.${extension}`;
}

export async function uploadPodBlob(blob: Blob, options: UploadPodBlobOptions): Promise<string | null> {
  const path = await createPodStoragePath(options.orderId, options.kind, options.extension);
  const { error } = await supabase.storage
    .from(POD_BUCKET)
    .upload(path, blob, {
      contentType: options.contentType,
      upsert: false,
    });

  if (error) {
    console.error("POD upload error:", error);
    return null;
  }

  return path;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

export async function uploadPodDataUrl(
  dataUrl: string,
  options: UploadPodBlobOptions,
): Promise<string | null> {
  return uploadPodBlob(dataUrlToBlob(dataUrl), options);
}

export async function getPodFileUrl(
  storagePathOrUrl: string | null | undefined,
  options: PodSignedUrlOptions = {},
): Promise<string | null> {
  if (!storagePathOrUrl) return null;
  if (isExternalPodUrl(storagePathOrUrl)) return storagePathOrUrl;

  const { data, error } = await supabase.functions.invoke("get-pod-file-url", {
    body: {
      path: storagePathOrUrl,
      orderId: options.orderId ?? null,
      purpose: options.purpose ?? "view",
    },
  });

  if (error) {
    console.error("POD signed URL error:", error);
    return null;
  }

  const signedUrl = (data as { signedUrl?: unknown } | null)?.signedUrl;
  return typeof signedUrl === "string" ? signedUrl : null;
}
