const MONTH_AS_SECONDS = 30 * 24 * 60 * 60;
export function getMultiplier(since: number) {
  return Math.max((Date.now() - since) / 1000 / MONTH_AS_SECONDS, 1);
}
