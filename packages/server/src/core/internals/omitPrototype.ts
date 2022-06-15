/**
 * Create an object without inheriting anything from `Object.prototype`
 * @internal
 */
export function omitPrototype<TObj1 extends Record<string, unknown>>(
  obj1: TObj1,
): TObj1 {
  return Object.assign(Object.create(null), obj1);
}
