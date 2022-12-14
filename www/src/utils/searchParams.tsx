export function searchParams(obj: Record<string, string | string[]>): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}
