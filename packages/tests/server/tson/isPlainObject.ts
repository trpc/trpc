export const isPlainObject = (
  payload: unknown,
): payload is Record<string, unknown> => {
  if (typeof payload !== 'object' || payload === null) return false;
  if (payload === Object.prototype) return false;
  if (Object.getPrototypeOf(payload) === null) return true;

  return Object.getPrototypeOf(payload) === Object.prototype;
};
