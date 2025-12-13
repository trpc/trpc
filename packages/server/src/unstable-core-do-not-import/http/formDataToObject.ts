/* eslint-disable @typescript-eslint/no-non-null-assertion */

const isNumberString = (str: string) => /^\d+$/.test(str);

// Prototype pollution guard
const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'constructor' || key === 'prototype';

function set(
  obj: Record<string, any>,
  path: readonly string[],
  value: unknown,
): void {
  if (path.length > 1) {
    const newPath = [...path];
    const key = newPath.shift()!;
    const nextKey = newPath[0]!;

    // Skip unsafe keys to prevent prototype pollution
    if (isUnsafeKey(key)) {
      return;
    }

    if (!Object.hasOwn(obj, key)) {
      obj[key] = isNumberString(nextKey) ? [] : Object.create(null);
    } else if (Array.isArray(obj[key]) && !isNumberString(nextKey)) {
      obj[key] = Object.fromEntries(Object.entries(obj[key]));
    }

    set(obj[key], newPath, value);

    return;
  }
  const p = path[0]!;

  // Skip unsafe keys to prevent prototype pollution
  if (isUnsafeKey(p)) {
    return;
  }

  if (obj[p] === undefined) {
    obj[p] = value;
  } else if (Array.isArray(obj[p])) {
    obj[p].push(value);
  } else {
    obj[p] = [obj[p], value];
  }
}

export function formDataToObject(formData: FormData) {
  const obj: Record<string, unknown> = Object.create(null);

  for (const [key, value] of formData.entries()) {
    const parts = key.split(/[\.\[\]]/).filter(Boolean);
    set(obj, parts, value);
  }

  return obj;
}
