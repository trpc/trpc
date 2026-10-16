export type Value<T, TArgs extends any[] = []> = T | ((...args: TArgs) => T)

export function value<T, TArgs extends any[]>(
  value: Value<T, TArgs>,
  ...args: NoInfer<TArgs>
): T extends Value<infer U, any> ? U : never {
  if (typeof value === 'function') {
    return (value as any)(...args)
  }

  return value as any
}
