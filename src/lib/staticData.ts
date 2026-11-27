/** Load portable gzip assets without relying on Content-Encoding server headers. */
export async function fetchStaticJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`The data file could not be loaded (HTTP ${response.status}).`);
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (header[0] !== 0x1f || header[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes)) as T;
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).json() as T;
  }
  const { gunzipSync, strFromU8 } = await import('fflate');
  return JSON.parse(strFromU8(gunzipSync(new Uint8Array(bytes)))) as T;
}
