/* eslint-disable @typescript-eslint/no-non-null-assertion */

const isNumberString = (str: string) => /^\d+$/.test(str);

function set(
  obj: Record<string, any>,
  path: readonly string[],
  value: unknown,
): void {
  if (path.length > 1) {
    const newPath = [...path];
    const key = newPath.shift()!;
    const nextKey = newPath[0]!;

    if (!obj[key]) {
      obj[key] = isNumberString(nextKey) ? [] : {};
    } else if (Array.isArray(obj[key]) && !isNumberString(nextKey)) {
      obj[key] = Object.fromEntries(Object.entries(obj[key]));
    }

    set(obj[key], newPath, value);

    return;
  }
  const p = path[0]!;
  if (obj[p] === undefined) {
    obj[p] = value;
  } else if (Array.isArray(obj[p])) {
    obj[p].push(value);
  } else {
    obj[p] = [obj[p], value];
  }
}

export function formDataToObject(formData: FormData) {
  const obj: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    const parts = key.split(/[\.\[\]]/).filter(Boolean);
    set(obj, parts, value);
  }

  return obj;
}
