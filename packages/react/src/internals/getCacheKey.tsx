export function getCacheKey<TTuple extends [string, ...unknown[]]>([
  path,
  input,
]: TTuple) {
  const cacheKey = [path, input ?? null];
  return cacheKey;
}
