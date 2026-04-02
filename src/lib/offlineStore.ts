/**
 * Offline storage for Proof of Delivery data using IndexedDB.
 * When the driver submits a POD without network connectivity,
 * the data is persisted locally and synced when back online.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────

export interface PendingPOD {
  id: string;
  tripStopId: string;
  orderId: string;
  recipientName: string;
  signatureDataUrl: string;
  photoDataUrls: string[];
  notes: string;
  createdAt: string;
}

// ─── IndexedDB Constants ────────────────────────────────────────────

const DB_NAME = "orderflow-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-pods";

// ─── Database Initialization ────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── CRUD Operations ────────────────────────────────────────────────

/**
 * Save a POD submission that failed to sync online.
 */
export async function savePendingPOD(data: PendingPOD): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieve all pending (unsynced) PODs.
 */
export async function getPendingPODs(): Promise<PendingPOD[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as PendingPOD[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Remove a specific pending POD after successful sync.
 */
export async function removePendingPOD(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// ─── Sync Logic ─────────────────────────────────────────────────────

/**
 * Convert a data URL to a Blob for upload.
 */
function dataUrlToBlob(dataUrl: string): Blob {
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

/**
 * Upload a single data-URL image to Supabase storage and return the public URL.
 */
async function uploadDataUrl(
  bucket: string,
  path: string,
  dataUrl: string,
  contentType: string
): Promise<string | null> {
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: true });

  if (error) {
    console.error("Offline sync upload error:", error);
    return null;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData?.publicUrl || null;
}

/**
 * Attempt to sync a single pending POD to the server.
 * Returns true if successful.
 */
async function syncSinglePOD(pod: PendingPOD): Promise<boolean> {
  try {
    // Upload signature
    let signatureUrl: string | null = null;
    if (pod.signatureDataUrl) {
      const sigPath = `signatures/${pod.orderId}-offline-${Date.now()}.png`;
      signatureUrl = await uploadDataUrl("pod-files", sigPath, pod.signatureDataUrl, "image/png");
    }

    // Upload photos
    const photoEntries: { url: string; type: string }[] = [];
    for (let i = 0; i < pod.photoDataUrls.length; i++) {
      const photoPath = `photos/${pod.orderId}-offline-${Date.now()}-${i}.jpg`;
      const url = await uploadDataUrl("pod-files", photoPath, pod.photoDataUrls[i], "image/jpeg");
      if (url) {
        photoEntries.push({ url, type: "delivery_photo" });
      }
    }

    // Insert POD record
    const { error } = await supabase.from("proof_of_delivery").insert({
      trip_stop_id: pod.tripStopId,
      order_id: pod.orderId || null,
      pod_status: "ONTVANGEN",
      signature_url: signatureUrl,
      photos: photoEntries,
      recipient_name: pod.recipientName,
      received_at: pod.createdAt,
      notes: pod.notes || null,
    });

    if (error) {
      console.error("Offline POD sync insert error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Offline POD sync failed:", err);
    return false;
  }
}

/**
 * Attempt to sync all pending PODs.
 * Returns counts of synced and failed items.
 */
export async function syncPendingPODs(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingPODs();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const pod of pending) {
    const success = await syncSinglePOD(pod);
    if (success) {
      await removePendingPOD(pod.id);
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}
