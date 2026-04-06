/**
 * Wraps a Supabase query and throws on error instead of silently failing.
 */
export async function supabaseExec<T>(
  query: PromiseLike<{ data: T; error: any }>
): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
