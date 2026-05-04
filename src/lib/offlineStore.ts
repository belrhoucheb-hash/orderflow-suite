/**
 * Offline storage for Proof of Delivery data using IndexedDB.
 * When the driver submits a POD without network connectivity,
 * the data is persisted locally and synced when back online.
 */

import { supabase } from "@/integrations/supabase/client";
import { uploadPodDataUrl } from "@/lib/podStorage";

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
  retryCount?: number;
}

const MAX_RETRIES = 5;

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
 * Upload a single data-URL image to private Supabase storage and return the storage path.
 */
async function uploadDataUrl(
  orderId: string,
  kind: "signature" | "photo",
  dataUrl: string,
  contentType: string,
  extension: "png" | "jpg",
): Promise<string | null> {
  return uploadPodDataUrl(dataUrl, { orderId, kind, contentType, extension });
}

/**
 * Attempt to sync a single pending POD to the server.
 * Returns an outcome describing whether the insert succeeded and whether
 * any photo uploads failed. Photos worden parallel geüpload zodat één
 * trage upload de hele sync niet vertraagt; partial-success is OK.
 */
type SyncOutcome =
  | { ok: true; partialPhotoFailure: boolean }
  | { ok: false; partialPhotoFailure: boolean; hadPhotos: boolean };

async function syncSinglePOD(pod: PendingPOD): Promise<SyncOutcome> {
  try {
    // Upload signature
    let signatureUrl: string | null = null;
    if (pod.signatureDataUrl) {
      signatureUrl = await uploadDataUrl(pod.orderId, "signature", pod.signatureDataUrl, "image/png", "png");
    }

    // Upload photos parallel zodat de slowest-link niet alle anderen blokkeert.
    const hadPhotos = pod.photoDataUrls.length > 0;
    const photoResults = await Promise.allSettled(
      pod.photoDataUrls.map((dataUrl) =>
        uploadDataUrl(pod.orderId, "photo", dataUrl, "image/jpeg", "jpg"),
      ),
    );

    const photoEntries: { url: string; type: string }[] = [];
    let photoFailures = 0;
    photoResults.forEach((res, idx) => {
      if (res.status === "fulfilled" && res.value) {
        photoEntries.push({ url: res.value, type: "delivery_photo" });
      } else {
        photoFailures++;
        const reason = res.status === "rejected" ? res.reason : "upload returned null";
        console.error(`Offline POD foto ${idx + 1} upload mislukt:`, reason);
      }
    });

    const partialPhotoFailure = photoFailures > 0 && photoEntries.length > 0;
    const allPhotosFailed = hadPhotos && photoEntries.length === 0;

    // Geen succesvolle foto's terwijl ze er wel waren: laat de POD pending zodat
    // we het later opnieuw kunnen proberen.
    if (allPhotosFailed) {
      return { ok: false, partialPhotoFailure: false, hadPhotos };
    }

    // Insert POD record met de foto's die het wel haalden.
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
      return { ok: false, partialPhotoFailure, hadPhotos };
    }

    return { ok: true, partialPhotoFailure };
  } catch (err) {
    console.error("Offline POD sync failed:", err);
    return { ok: false, partialPhotoFailure: false, hadPhotos: pod.photoDataUrls.length > 0 };
  }
}

/**
 * Attempt to sync all pending PODs.
 * Returns counts of synced and failed items.
 */
export async function syncPendingPODs(): Promise<{ synced: number; failed: number; abandoned: number }> {
  const pending = await getPendingPODs();
  if (pending.length === 0) return { synced: 0, failed: 0, abandoned: 0 };

  let synced = 0;
  let failed = 0;
  let abandoned = 0;

  for (const pod of pending) {
    const retries = pod.retryCount ?? 0;

    if (retries >= MAX_RETRIES) {
      // Te vaak gefaald, verwijder zodat het niet blijft spammen.
      await removePendingPOD(pod.id);
      abandoned++;
      continue;
    }

    const outcome = await syncSinglePOD(pod);
    if (outcome.ok) {
      await removePendingPOD(pod.id);
      synced++;
    } else {
      // Bij partial-success op foto's hebben we geen insert gedaan; bij volledige
      // foto-fail óf insert-fail bumpen we de retry-teller.
      await savePendingPOD({ ...pod, retryCount: retries + 1 });
      failed++;
    }
  }

  return { synced, failed, abandoned };
}
