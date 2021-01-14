// --------------- "Library code" ---------------
type Prefix<K extends string, T extends string> = `${K}${T}`;

export type Prefixer<TObj extends Record<string, any>, TPrefix extends string> = {
  [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
};
export type ResolverFn<TContext, TData, TArgs extends any[]> = (
  ctx: TContext,
  ...args: TArgs
) => Promise<TData> | TData;

export type DropFirst<T extends readonly unknown[]> = T extends readonly [any?, ...infer U] ? U : [...T];
