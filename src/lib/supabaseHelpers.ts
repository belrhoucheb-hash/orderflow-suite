import { supabase } from "@/integrations/supabase/client";

/**
 * Type-safe helper for querying tables not yet in the generated Supabase types.
 * Use this instead of `(supabase as any).from(tableName)` to centralise the cast.
 * TODO: Remove after running `supabase gen types typescript` to regenerate types.
 */
export function fromTable(tableName: string) {
  return (supabase as any).from(tableName);
}
