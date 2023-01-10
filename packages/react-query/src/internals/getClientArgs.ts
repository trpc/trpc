export function getClientArgs<TOptions>(
  path: string[],
  input: unknown,
  opts: TOptions,
) {
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}
