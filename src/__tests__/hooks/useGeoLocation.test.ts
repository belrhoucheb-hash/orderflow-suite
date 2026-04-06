import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGeoLocation } from "@/hooks/useGeoLocation";

// ─── Mock navigator.geolocation ────────────────────────────��───

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

let watchCallbacks: { success: SuccessCb; error: ErrorCb }[] = [];
let watchIdCounter = 0;

const mockWatchPosition = vi.fn(
  (success: SuccessCb, error: ErrorCb, _options?: PositionOptions) => {
    const id = ++watchIdCounter;
    watchCallbacks.push({ success, error });
    return id;
  },
);
const mockClearWatch = vi.fn();
const mockGetCurrentPosition = vi.fn();

function createMockPosition(
  lat: number,
  lng: number,
  overrides?: Partial<GeolocationCoordinates>,
): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: overrides?.heading ?? null,
      speed: overrides?.speed ?? null,
      ...overrides,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

beforeEach(() => {
  watchCallbacks = [];
  watchIdCounter = 0;
  mockWatchPosition.mockClear();
  mockClearWatch.mockClear();
  mockGetCurrentPosition.mockClear();

  Object.defineProperty(navigator, "geolocation", {
    value: {
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
      getCurrentPosition: mockGetCurrentPosition,
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────

describe("useGeoLocation", () => {
  it("initializes with null position and not tracking", () => {
    const { result } = renderHook(() => useGeoLocation());
    expect(result.current.position).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isTracking).toBe(false);
  });

  it("starts tracking when startTracking is called", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(true);
    expect(mockWatchPosition).toHaveBeenCalledOnce();
    expect(mockWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      }),
    );
  });

  it("does not call watchPosition twice when startTracking called twice", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });
    act(() => {
      result.current.startTracking();
    });

    expect(mockWatchPosition).toHaveBeenCalledOnce();
  });

  it("updates position when geolocation fires success", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    const mockPos = createMockPosition(52.3676, 4.9041, {
      heading: 180,
      speed: 25.5,
      accuracy: 5,
    });

    act(() => {
      watchCallbacks[0].success(mockPos);
    });

    expect(result.current.position).not.toBeNull();
    expect(result.current.position!.lat).toBe(52.3676);
    expect(result.current.position!.lng).toBe(4.9041);
    expect(result.current.position!.heading).toBe(180);
    expect(result.current.position!.speed).toBe(25.5);
    expect(result.current.position!.accuracy).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it("updates position on subsequent callbacks", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    act(() => {
      watchCallbacks[0].success(createMockPosition(52.0, 4.0));
    });

    expect(result.current.position!.lat).toBe(52.0);

    act(() => {
      watchCallbacks[0].success(createMockPosition(53.0, 5.0));
    });

    expect(result.current.position!.lat).toBe(53.0);
    expect(result.current.position!.lng).toBe(5.0);
  });

  it("stops tracking when stopTracking is called", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(true);

    act(() => {
      result.current.stopTracking();
    });

    expect(result.current.isTracking).toBe(false);
    expect(mockClearWatch).toHaveBeenCalledOnce();
  });

  it("sets error state on permission denied", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    const permissionError = {
      code: 1,
      message: "User denied Geolocation",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError;

    act(() => {
      watchCallbacks[0].error(permissionError);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.code).toBe(1);
    expect(result.current.error!.message).toBe("User denied Geolocation");
  });

  it("sets error state on position unavailable", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    const posError = {
      code: 2,
      message: "Position unavailable",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError;

    act(() => {
      watchCallbacks[0].error(posError);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.code).toBe(2);
  });

  it("sets error state on timeout", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    const timeoutError = {
      code: 3,
      message: "Timeout expired",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError;

    act(() => {
      watchCallbacks[0].error(timeoutError);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.code).toBe(3);
  });

  it("clears error when a successful position arrives after error", () => {
    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    act(() => {
      watchCallbacks[0].error({
        code: 2,
        message: "Temporary failure",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      watchCallbacks[0].success(createMockPosition(52.0, 4.0));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.position).not.toBeNull();
  });

  it("handles missing navigator.geolocation", () => {
    // Remove geolocation
    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.code).toBe(2);
  });

  it("cleans up watch on unmount", () => {
    const { result, unmount } = renderHook(() => useGeoLocation());

    act(() => {
      result.current.startTracking();
    });

    unmount();

    expect(mockClearWatch).toHaveBeenCalled();
  });

  it("accepts custom options", () => {
    const { result } = renderHook(() =>
      useGeoLocation({
        enableHighAccuracy: false,
        maximumAge: 5000,
        timeout: 10000,
      }),
    );

    act(() => {
      result.current.startTracking();
    });

    expect(mockWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: false,
        maximumAge: 5000,
        timeout: 10000,
      }),
    );
  });
});
