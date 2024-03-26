/* eslint-disable @typescript-eslint/no-non-null-assertion */
function set(
  obj: Record<string, any>,
  path: string[] | string,
  value: unknown,
): void {
  if (typeof path === 'string') {
    path = path.split(/[\.\[\]]/).filter(Boolean);
  }

  if (path.length > 1) {
    const p = path.shift()!;
    const isArrayIndex = /^\d+$/.test(path[0]!);
    obj[p] = obj[p] || (isArrayIndex ? [] : {});
    set(obj[p], path, value);
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
    set(obj, key, value);
  }

  return obj;
}
