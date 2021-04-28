export function getCacheKey<TTuple extends [string, ...unknown[]]>(
  [path, input]: TTuple,
  extras?: string,
) {
  const cacheKey = [path, input ?? null];
  if (extras) {
    cacheKey.push(extras);
  }
  return cacheKey;
}
