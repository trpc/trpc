/**
 * Create an object without inheriting anything from `Object.prototype`
 * @internal
 */
export function omitPrototype<TObj extends Record<string, unknown>>(
  obj: TObj,
): TObj {
  return Object.assign(Object.create(null), obj);
}
