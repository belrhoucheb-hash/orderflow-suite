import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// We need to reset module state between tests since use-toast uses module-level state
let useToastModule: typeof import("@/hooks/use-toast");

describe("use-toast", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Fresh import to reset module-level state
    vi.resetModules();
    useToastModule = await import("@/hooks/use-toast");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty toasts initially", () => {
    const { result } = renderHook(() => useToastModule.useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it("adds a toast", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Hello" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Hello");
    expect(result.current.toasts[0].open).toBe(true);
  });

  it("limits toasts to TOAST_LIMIT (1)", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "First" });
    });
    act(() => {
      useToastModule.toast({ title: "Second" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Second");
  });

  it("dismisses a specific toast", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    let toastReturn: any;
    act(() => {
      toastReturn = useToastModule.toast({ title: "Test" });
    });

    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      result.current.dismiss(toastReturn.id);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("dismisses all toasts when no id provided", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Test" });
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("updates a toast", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    let toastReturn: any;
    act(() => {
      toastReturn = useToastModule.toast({ title: "Original" });
    });

    act(() => {
      toastReturn.update({ id: toastReturn.id, title: "Updated" });
    });

    expect(result.current.toasts[0].title).toBe("Updated");
  });

  it("removes toast after dismiss delay", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    let toastReturn: any;
    act(() => {
      toastReturn = useToastModule.toast({ title: "Test" });
    });

    act(() => {
      toastReturn.dismiss();
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].open).toBe(false);

    // Advance past TOAST_REMOVE_DELAY
    act(() => {
      vi.advanceTimersByTime(1_000_001);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("removes all toasts when toastId is undefined in REMOVE_TOAST", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Test" });
    });

    // Use the reducer directly
    const state = { toasts: result.current.toasts };
    const newState = useToastModule.reducer(state, { type: "REMOVE_TOAST", toastId: undefined });
    expect(newState.toasts).toEqual([]);
  });

  it("removes specific toast in REMOVE_TOAST", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    let toastReturn: any;
    act(() => {
      toastReturn = useToastModule.toast({ title: "Test" });
    });

    const state = { toasts: result.current.toasts };
    const newState = useToastModule.reducer(state, { type: "REMOVE_TOAST", toastId: toastReturn.id });
    expect(newState.toasts).toHaveLength(0);
  });

  it("toast function returns dismiss and update methods", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    let toastReturn: any;
    act(() => {
      toastReturn = useToastModule.toast({ title: "Test" });
    });

    expect(toastReturn).toHaveProperty("id");
    expect(toastReturn).toHaveProperty("dismiss");
    expect(toastReturn).toHaveProperty("update");
    expect(typeof toastReturn.dismiss).toBe("function");
    expect(typeof toastReturn.update).toBe("function");
  });

  it("onOpenChange triggers dismiss", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Test" });
    });

    const toast = result.current.toasts[0];
    expect(toast.onOpenChange).toBeDefined();

    act(() => {
      toast.onOpenChange!(false);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("handles multiple listeners", () => {
    const { result: result1 } = renderHook(() => useToastModule.useToast());
    const { result: result2 } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Shared" });
    });

    expect(result1.current.toasts).toHaveLength(1);
    expect(result2.current.toasts).toHaveLength(1);
  });

  it("cleans up listener on unmount", () => {
    const { unmount } = renderHook(() => useToastModule.useToast());
    unmount();
    // No error should occur - listener is removed
  });

  it("toast with description", () => {
    const { result } = renderHook(() => useToastModule.useToast());

    act(() => {
      useToastModule.toast({ title: "Title", description: "Description text" });
    });

    expect(result.current.toasts[0].title).toBe("Title");
    expect(result.current.toasts[0].description).toBe("Description text");
  });
});

describe("reducer", () => {
  it("ADD_TOAST adds toast to beginning", async () => {
    vi.resetModules();
    const mod = await import("@/hooks/use-toast");

    const state = { toasts: [] };
    const newState = mod.reducer(state, {
      type: "ADD_TOAST",
      toast: { id: "1", title: "Test", open: true },
    });
    expect(newState.toasts).toHaveLength(1);
    expect(newState.toasts[0].id).toBe("1");
  });

  it("UPDATE_TOAST updates matching toast", async () => {
    vi.resetModules();
    const mod = await import("@/hooks/use-toast");

    const state = { toasts: [{ id: "1", title: "Old", open: true }] };
    const newState = mod.reducer(state, {
      type: "UPDATE_TOAST",
      toast: { id: "1", title: "New" },
    });
    expect(newState.toasts[0].title).toBe("New");
    expect(newState.toasts[0].open).toBe(true);
  });

  it("UPDATE_TOAST does not affect non-matching toasts", async () => {
    vi.resetModules();
    const mod = await import("@/hooks/use-toast");

    const state = { toasts: [{ id: "1", title: "Keep", open: true }] };
    const newState = mod.reducer(state, {
      type: "UPDATE_TOAST",
      toast: { id: "999", title: "X" },
    });
    expect(newState.toasts[0].title).toBe("Keep");
  });

  it("DISMISS_TOAST without toastId dismisses all", async () => {
    vi.resetModules();
    const mod = await import("@/hooks/use-toast");

    const state = {
      toasts: [
        { id: "1", title: "A", open: true },
        { id: "2", title: "B", open: true },
      ],
    };
    const newState = mod.reducer(state, { type: "DISMISS_TOAST" });
    expect(newState.toasts.every((t: any) => t.open === false)).toBe(true);
  });
});
