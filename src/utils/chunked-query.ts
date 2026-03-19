/**
 * Chunked .in() queries for Supabase.
 *
 * Supabase/PostgREST silently fails with >1000 IDs in .in() filters.
 * This utility splits large arrays into chunks and merges results.
 */

const MAX_IN_SIZE = 500;

export async function chunkedIn<T>(
  queryFn: (ids: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  ids: string[]
): Promise<T[]> {
  if (ids.length <= MAX_IN_SIZE) {
    const { data } = await queryFn(ids);
    return data || [];
  }

  const results: T[] = [];
  for (let i = 0; i < ids.length; i += MAX_IN_SIZE) {
    const chunk = ids.slice(i, i + MAX_IN_SIZE);
    const { data } = await queryFn(chunk);
    if (data) results.push(...data);
  }
  return results;
}
