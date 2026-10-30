/**
 * Enterprise Framework - streaming-reader-helper
 */
export async function* readChunks(stream: any) {
  for await (const chunk of stream) yield chunk;
}
