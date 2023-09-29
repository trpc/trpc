export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return !!value && Object.prototype.toString.call(value) === '[object Object]';
}
