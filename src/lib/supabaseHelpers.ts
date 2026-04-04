import { supabase } from "@/integrations/supabase/client";

/**
 * Helper for querying tables not yet in generated Supabase types.
 * TODO: Remove after running `supabase gen types typescript` to regenerate types.
 */
export function fromTable(tableName: string) {
  return (supabase as any).from(tableName);
}
