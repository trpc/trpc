// eslint-disable-next-line @typescript-eslint/naming-convention
export function searchParams<T extends Record<string, string | string[]>>(
  obj: T,
): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}
