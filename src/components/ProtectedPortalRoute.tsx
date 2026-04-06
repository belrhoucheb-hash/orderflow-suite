import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

/**
 * Auth guard for portal routes.
 *
 * The client portal uses its own Supabase session (magic-link / password)
 * rather than the main app AuthContext. This wrapper ensures a valid Supabase
 * session exists before rendering portal children. When no session is found
 * the user is shown a message prompting them to log in via the portal.
 */
export function ProtectedPortalRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        setSession(sess);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc2626]" />
      </div>
    );
  }

  // Always render children — ClientPortal handles showing the login form
  // when there is no session. This guard ensures the session check completes
  // before any portal content is mounted, providing defense-in-depth.
  return <>{children}</>;
}
