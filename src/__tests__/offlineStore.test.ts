import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase (hoisted) ──────────────────────────────────────────
const { mockUpload, mockGetPublicUrl, mockStorageFrom, mockInsert, mockFrom } = vi.hoisted(() => {
  const mockUpload = vi.fn().mockResolvedValue({ error: null });
  const mockGetPublicUrl = vi.fn().mockReturnValue({
    data: { publicUrl: "https://storage.example.com/file.png" },
  });
  const mockStorageFrom = vi.fn().mockReturnValue({
    upload: mockUpload,
    getPublicUrl: mockGetPublicUrl,
  });
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
  return { mockUpload, mockGetPublicUrl, mockStorageFrom, mockInsert, mockFrom };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

// ─── Persistent IndexedDB Mock ────────────────────────────────────────
// We need a mock that supports multiple openDB calls (sync calls open multiple times).
let idbData: Map<string, any>;
let idbStoreCreated: boolean;

function setupPersistentIDB() {
  idbData = new Map();
  idbStoreCreated = false;

  (globalThis as any).indexedDB = {
    open: vi.fn().mockImplementation(() => {
      const storeMock = {
        put: vi.fn((item: any) => {
          idbData.set(item.id, item);
          const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
          Promise.resolve().then(() => req.onsuccess?.());
          return req;
        }),
        getAll: vi.fn(() => {
          const req: any = { result: [...idbData.values()], error: null, onsuccess: null, onerror: null };
          Promise.resolve().then(() => req.onsuccess?.());
          return req;
        }),
        delete: vi.fn((id: string) => {
          idbData.delete(id);
          const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
          Promise.resolve().then(() => req.onsuccess?.());
          return req;
        }),
      };

      const txMock: any = {
        objectStore: vi.fn().mockReturnValue(storeMock),
        oncomplete: null,
      };
      // Fire oncomplete after onsuccess of the store operation
      Promise.resolve().then(() => Promise.resolve().then(() => Promise.resolve().then(() => txMock.oncomplete?.())));

      const dbMock = {
        transaction: vi.fn().mockReturnValue(txMock),
        objectStoreNames: { contains: vi.fn().mockReturnValue(!idbStoreCreated ? false : true) },
        createObjectStore: vi.fn(() => { idbStoreCreated = true; }),
        close: vi.fn(),
      };

      const openReq: any = {
        result: dbMock,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      Promise.resolve().then(() => {
        openReq.onupgradeneeded?.();
        openReq.onsuccess?.();
      });
      return openReq;
    }),
  };
}

// ─── Import after mocking ─────────────────────────────────────────────
import {
  savePendingPOD,
  getPendingPODs,
  removePendingPOD,
  syncPendingPODs,
  type PendingPOD,
} from "@/lib/offlineStore";

const samplePOD: PendingPOD = {
  id: "pod-1",
  tripStopId: "ts-1",
  orderId: "ord-1",
  recipientName: "Jan Jansen",
  signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  photoDataUrls: ["data:image/jpeg;base64,/9j/4AAQ"],
  notes: "Left at door",
  createdAt: "2026-04-03T10:00:00Z",
};

describe("savePendingPOD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPersistentIDB();
  });

  it("stores a POD in IndexedDB", async () => {
    await savePendingPOD(samplePOD);
    expect(idbData.has("pod-1")).toBe(true);
    expect(idbData.get("pod-1")).toEqual(samplePOD);
  });

  it("rejects when the put request fails", async () => {
    // Override with a failing mock
    (globalThis as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        const storeMock = {
          put: vi.fn(() => {
            const req: any = { result: undefined, error: new DOMException("Write failed"), onsuccess: null, onerror: null };
            Promise.resolve().then(() => req.onerror?.());
            return req;
          }),
        };
        const txMock: any = { objectStore: vi.fn().mockReturnValue(storeMock), oncomplete: null };
        Promise.resolve().then(() => Promise.resolve().then(() => txMock.oncomplete?.()));
        const dbMock = {
          transaction: vi.fn().mockReturnValue(txMock),
          objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
          createObjectStore: vi.fn(),
          close: vi.fn(),
        };
        const openReq: any = { result: dbMock, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        Promise.resolve().then(() => { openReq.onupgradeneeded?.(); openReq.onsuccess?.(); });
        return openReq;
      }),
    };

    await expect(savePendingPOD(samplePOD)).rejects.toBeDefined();
  });
});

describe("getPendingPODs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPersistentIDB();
  });

  it("returns all stored PODs", async () => {
    idbData.set("pod-1", samplePOD);
    const result = await getPendingPODs();
    expect(result).toEqual([samplePOD]);
  });

  it("returns an empty array when no PODs are stored", async () => {
    const result = await getPendingPODs();
    expect(result).toEqual([]);
  });
});

describe("removePendingPOD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPersistentIDB();
  });

  it("deletes a POD by id from IndexedDB", async () => {
    idbData.set("pod-1", samplePOD);
    await removePendingPOD("pod-1");
    expect(idbData.has("pod-1")).toBe(false);
  });
});

describe("syncPendingPODs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPersistentIDB();
    mockUpload.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/file.png" },
    });
    mockStorageFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it("returns { synced: 0, failed: 0 } when there are no pending PODs", async () => {
    const result = await syncPendingPODs();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it("syncs a pending POD and removes it from IndexedDB", async () => {
    idbData.set("pod-1", samplePOD);

    const result = await syncPendingPODs();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockStorageFrom).toHaveBeenCalledWith("pod-files");
    expect(mockFrom).toHaveBeenCalledWith("proof_of_delivery");
    // Should have been removed from IDB
    expect(idbData.has("pod-1")).toBe(false);
  });

  it("counts a POD as failed when the insert errors", async () => {
    idbData.set("pod-1", samplePOD);
    mockInsert.mockResolvedValueOnce({ error: { message: "Insert failed" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await syncPendingPODs();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    // Should NOT have been removed from IDB
    expect(idbData.has("pod-1")).toBe(true);
    (console.error as any).mockRestore();
  });

  it("handles POD without signature", async () => {
    const podNoSig = { ...samplePOD, signatureDataUrl: "", photoDataUrls: [] };
    idbData.set("pod-1", podNoSig);

    const result = await syncPendingPODs();

    expect(result.synced).toBe(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ signature_url: null })
    );
  });

  it("handles upload errors for photos gracefully", async () => {
    idbData.set("pod-1", samplePOD);
    mockUpload
      .mockResolvedValueOnce({ error: null })       // signature succeeds
      .mockResolvedValueOnce({ error: { message: "Upload failed" } }); // photo fails
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await syncPendingPODs();

    // Still syncs because the insert itself succeeds
    expect(result.synced).toBe(1);
    (console.error as any).mockRestore();
  });

  it("handles sync exception by returning failed count", async () => {
    idbData.set("pod-1", samplePOD);
    mockStorageFrom.mockImplementationOnce(() => {
      throw new Error("Network error");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await syncPendingPODs();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    (console.error as any).mockRestore();
  });

  it("syncs multiple PODs and counts correctly", async () => {
    const pod2: PendingPOD = { ...samplePOD, id: "pod-2", orderId: "ord-2" };
    idbData.set("pod-1", samplePOD);
    idbData.set("pod-2", pod2);

    const result = await syncPendingPODs();

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("handles POD with multiple photos", async () => {
    const multiPhotoPod = {
      ...samplePOD,
      photoDataUrls: [
        "data:image/jpeg;base64,/9j/photo1",
        "data:image/jpeg;base64,/9j/photo2",
        "data:image/jpeg;base64,/9j/photo3",
      ],
    };
    idbData.set("pod-1", multiPhotoPod);

    const result = await syncPendingPODs();

    expect(result.synced).toBe(1);
    // 1 signature + 3 photos = 4 uploads
    expect(mockUpload).toHaveBeenCalledTimes(4);
  });

  it("inserts POD with correct field mapping", async () => {
    idbData.set("pod-1", samplePOD);

    await syncPendingPODs();

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        trip_stop_id: "ts-1",
        order_id: "ord-1",
        pod_status: "ONTVANGEN",
        recipient_name: "Jan Jansen",
        received_at: "2026-04-03T10:00:00Z",
        notes: "Left at door",
      })
    );
  });

  it("sets notes to null when empty string", async () => {
    const podNoNotes = { ...samplePOD, notes: "" };
    idbData.set("pod-1", podNoNotes);

    await syncPendingPODs();

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null })
    );
  });
});

describe("openDB upgrade path", () => {
  it("creates object store when it does not exist", async () => {
    const createObjectStore = vi.fn();
    (globalThis as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        const dbMock = {
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              getAll: vi.fn(() => {
                const req: any = { result: [], error: null, onsuccess: null, onerror: null };
                Promise.resolve().then(() => req.onsuccess?.());
                return req;
              }),
            }),
            oncomplete: null,
          }),
          objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
          createObjectStore,
          close: vi.fn(),
        };
        // Wire up oncomplete
        const tx = dbMock.transaction();
        Promise.resolve().then(() => Promise.resolve().then(() => tx.oncomplete?.()));
        dbMock.transaction = vi.fn().mockReturnValue(tx);

        const openReq: any = { result: dbMock, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        Promise.resolve().then(() => { openReq.onupgradeneeded?.(); openReq.onsuccess?.(); });
        return openReq;
      }),
    };

    await getPendingPODs();

    expect(createObjectStore).toHaveBeenCalledWith("pending-pods", { keyPath: "id" });
  });

  it("does not create object store when it already exists", async () => {
    const createObjectStore = vi.fn();
    (globalThis as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        const dbMock = {
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              getAll: vi.fn(() => {
                const req: any = { result: [], error: null, onsuccess: null, onerror: null };
                Promise.resolve().then(() => req.onsuccess?.());
                return req;
              }),
            }),
            oncomplete: null,
          }),
          objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
          createObjectStore,
          close: vi.fn(),
        };
        const tx = dbMock.transaction();
        Promise.resolve().then(() => Promise.resolve().then(() => tx.oncomplete?.()));
        dbMock.transaction = vi.fn().mockReturnValue(tx);

        const openReq: any = { result: dbMock, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        Promise.resolve().then(() => { openReq.onupgradeneeded?.(); openReq.onsuccess?.(); });
        return openReq;
      }),
    };

    await getPendingPODs();

    expect(createObjectStore).not.toHaveBeenCalled();
  });
});

describe("openDB error path", () => {
  it("rejects when indexedDB.open fails", async () => {
    (globalThis as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        const openReq: any = {
          result: null,
          error: new DOMException("DB open failed"),
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        Promise.resolve().then(() => openReq.onerror?.());
        return openReq;
      }),
    };

    await expect(getPendingPODs()).rejects.toBeDefined();
  });
});
