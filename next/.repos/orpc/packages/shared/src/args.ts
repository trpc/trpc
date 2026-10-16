export type MaybeOptionalOptions<TOptions> = object extends TOptions
  ? [options?: TOptions]
  : [options: TOptions]

export function resolveMaybeOptionalOptions<T>(rest: MaybeOptionalOptions<T>): T {
  return rest[0] ?? {} as T // 0 only undefined when all fields are optional
}
