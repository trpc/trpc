/**
 * Simple Levenshtein distance implementation (small N, no perf worries)
 */
const levenshtein = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  const dp: Array<Array<number>> = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

/**
 * Return suggestions with minimum distance found, up to distance 2.
 *
 * @internal
 */
export const suggest = (input: string, candidates: ReadonlyArray<string>): ReadonlyArray<string> => {
  const distances = candidates
    .map((c) => [levenshtein(input, c), c] as const)
    .filter(([d]) => d <= 2) // Stricter threshold
    .sort(([a], [b]) => a - b)

  if (distances.length === 0) return []

  // Only return suggestions with the minimum distance found
  const minDistance = distances[0][0]
  return distances
    .filter(([d]) => d === minDistance)
    .map(([, c]) => c)
}
