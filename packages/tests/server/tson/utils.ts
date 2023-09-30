export const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  if (!obj || typeof obj !== 'object') return false;
  if (obj === Object.prototype) return false;
  if (Object.getPrototypeOf(obj) === null) return true;

  return Object.getPrototypeOf(obj) === Object.prototype;
};
