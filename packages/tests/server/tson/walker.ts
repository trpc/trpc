import { isPlainObject } from './isPlainObject';

function isWalkable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return !!value && typeof value === 'object';
}
type WalkResult = [unknown] | null;
export type TsonWalkerInnerCallback = (innerValue: unknown) => unknown;

export function walker(
  value: unknown,
  visit: (node: unknown, walkInner: TsonWalkerInnerCallback) => WalkResult,
): unknown {
  const result = visit(value, (innerValue) => {
    return isWalkable(value) ? walker(innerValue, visit) : innerValue;
  });

  if (result) {
    return result[0];
  }

  if (Array.isArray(value)) {
    return value.map((value) => {
      return walker(value, visit);
    });
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      result[key] = walker(inner, visit);
    }
    return result;
  }

  return value;
}
