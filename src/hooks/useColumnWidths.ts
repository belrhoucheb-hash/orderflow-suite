import { useCallback, useEffect, useRef } from "react";

type WidthRecord = Record<string, number>;

function readStored(storageKey: string): WidthRecord {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as WidthRecord;
    return {};
  } catch {
    return {};
  }
}

export function useColumnWidths(storageKey: string): {
  attachRef: (key: string) => (el: HTMLElement | null) => void;
} {
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const widthsRef = useRef<WidthRecord>(readStored(storageKey));
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementToKeyRef = useRef<Map<Element, string>>(new Map());
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleWrite = useCallback(() => {
    if (typeof window === "undefined") return;
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(widthsRef.current));
      } catch {
        // ignore quota / disabled storage
      }
    }, 150);
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = elementToKeyRef.current.get(entry.target);
        if (!key) continue;
        const width = Math.round((entry.target as HTMLElement).getBoundingClientRect().width);
        if (width <= 0) continue;
        if (widthsRef.current[key] !== width) {
          widthsRef.current[key] = width;
          changed = true;
        }
      }
      if (changed) scheduleWrite();
    });
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
  }, [scheduleWrite]);

  const attachRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      const previous = elementsRef.current.get(key);
      if (previous && previous !== el) {
        observerRef.current?.unobserve(previous);
        elementToKeyRef.current.delete(previous);
        elementsRef.current.delete(key);
      }
      if (!el) return;

      elementsRef.current.set(key, el);
      elementToKeyRef.current.set(el, key);

      const stored = widthsRef.current[key];
      if (typeof stored === "number" && stored > 0) {
        el.style.width = `${stored}px`;
      }

      observerRef.current?.observe(el);
    },
    [],
  );

  return { attachRef };
}