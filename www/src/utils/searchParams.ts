const isArray = (value: unknown): value is readonly unknown[] | unknown[] =>
  Array.isArray(value);

export function searchParams(
  obj: Record<string, readonly string[] | string[] | string>,
): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      const values = isArray(value) ? value : [value];

      return values.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
    })
    .join('&');
}
