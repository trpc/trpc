const isArray = (value: unknown): value is unknown[] | Readonly<unknown[]> =>
  Array.isArray(value);

export function searchParams(
  obj: Record<string, string | string[] | Readonly<string[]>>,
): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}
