const isNumber = (value: string) => /^\d+$/.test(value);

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function set(
  obj: Record<string, any>,
  path: readonly string[],
  value: unknown,
): void {
  if (path.length > 1) {
    const newPath = [...path];
    const p = newPath.shift()!;

    obj[p] ??= isNumber(newPath[0]!) ? [] : {};
    set(obj[p], newPath, value);
    return;
  }
  const key = path[0]!;
  if (obj[key] === undefined) {
    obj[key] = value;
  } else if (Array.isArray(obj[key])) {
    obj[key] = value;
  } else {
    obj[key] = [obj[key], value];
  }
}

export function formDataToObject(formData: FormData) {
  const obj: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    const parts = key.split(/[\.\[\]]/).filter(Boolean);
    // console.log({ parts });
    set(obj, parts, value);
  }

  return obj;
}
