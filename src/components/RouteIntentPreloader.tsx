import { useEffect } from "react";
import { preloadAppRoute } from "@/lib/routePreload";

function preloadFromEvent(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;

  preloadAppRoute(link.href);
}

export function RouteIntentPreloader() {
  useEffect(() => {
    const options = { capture: true, passive: true } as const;
    document.addEventListener("pointerover", preloadFromEvent, options);
    document.addEventListener("focusin", preloadFromEvent, { capture: true });
    document.addEventListener("touchstart", preloadFromEvent, options);

    return () => {
      document.removeEventListener("pointerover", preloadFromEvent, options);
      document.removeEventListener("focusin", preloadFromEvent, { capture: true });
      document.removeEventListener("touchstart", preloadFromEvent, options);
    };
  }, []);

  return null;
}
