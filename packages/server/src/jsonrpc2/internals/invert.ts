type AllValues<T extends Record<PropertyKey, PropertyKey>> = {
  [P in keyof T]: { key: P; value: T[P] };
}[keyof T];
type InvertResult<T extends Record<PropertyKey, PropertyKey>> = {
  [P in AllValues<T>['value']]: Extract<AllValues<T>, { value: P }>['key'];
};
export function invert<T extends Record<PropertyKey, PropertyKey>>(
  obj: T,
): InvertResult<T> {
  const newObj = {} as any;
  for (const key in obj) {
    const v = obj[key];
    newObj[v] = key;
  }
  return newObj;
}
