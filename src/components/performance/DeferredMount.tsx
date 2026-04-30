import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LoadingState } from "@/components/ui/LoadingState";

interface DeferredMountProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function DeferredMount({
  children,
  label = "Onderdeel laden",
  className,
}: DeferredMountProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 180 });
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) {
    return (
      <div className={className}>
        <LoadingState message={label} />
      </div>
    );
  }

  return <>{children}</>;
}
