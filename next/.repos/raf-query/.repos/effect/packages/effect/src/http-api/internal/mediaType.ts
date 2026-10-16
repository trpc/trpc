/**
 * @internal
 */
export function normalize(contentType: string): string {
  const normalized = contentType.toLowerCase().trim()
  const index = normalized.indexOf(";")
  return index === -1 ? normalized : normalized.slice(0, index).trim()
}
