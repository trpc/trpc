import { omitPrototype } from './omitPrototype';

export function prefixObjectKeys(obj: Record<string, unknown>, prefix: string) {
  const newObj: Record<string, unknown> = omitPrototype({});
  for (const key in obj ?? {}) {
    newObj[prefix + key] = obj[key];
  }
  return newObj;
}
