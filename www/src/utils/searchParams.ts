const isArray = (value: unknown): value is Readonly<unknown[]> | unknown[] =>
  Array.isArray(value);

export function searchParams(
  obj: Record<string, Readonly<string[]> | string[] | string>,
): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}
