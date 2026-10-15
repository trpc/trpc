/**
 * Type-only model of links that declare the call options and context they
 * read. Shared by the D-A/B/C/E repros; only `createTrpcClient` differs.
 */
import type { Procedure } from '../builder-generics/positional.ts';

export type { Procedure };

export interface LinkDecl {
  options?: object;
  context?: object;
}

type IsAny<T> = 0 extends 1 & T ? true : false;
type RouterPaths<TRouter, TPrefix extends string = ''> =
  IsAny<TRouter> extends true ? string : RouterPathsInner<TRouter, TPrefix>;
type RouterPathsInner<TRouter, TPrefix extends string> = {
  [K in keyof TRouter & string]: TRouter[K] extends Procedure<
    any,
    any,
    any,
    any
  >
    ? `${TPrefix}${K}`
    : RouterPaths<TRouter[K], `${TPrefix}${K}.`>;
}[keyof TRouter & string];

export interface Operation<TPath extends string = string> {
  type: 'query' | 'mutation';
  path: TPath;
  input: unknown;
  context: Record<string, unknown>;
}

/**
 * `TRouter` is a phantom so router-aware links (e.g. `splitLink`) can type `op.path`.
 * `decl` must be invariant: if it were covariant, a declaration-less link would be a
 * supertype of every other link, and `[cacheLink(), loggerLink()]` would collapse to
 * `TrpcLink<{}>[]` through subtype reduction, losing `ignoreCache`.
 */
export interface TrpcLink<TDecl extends LinkDecl = {}, TRouter = any> {
  readonly '~types'?: { decl: (d: TDecl) => TDecl; router: TRouter };
  (op: Operation): Promise<unknown>;
}

export type AnyLink = TrpcLink<any, any>;

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type DeclOf<TLink> = TLink extends TrpcLink<infer D, any> ? D : never;
type OptionsOf<D> = D extends { options: infer O } ? O : never;
type ContextOf<D> = D extends { context: infer C } ? C : never;
type Merge<T> = Simplify<UnionToIntersection<T>>;

/** F-A (`options`, top level) and F-B (`context`) are both expressible. */
export type CallOptions<TLinks extends readonly AnyLink[]> = Merge<
  OptionsOf<DeclOf<TLinks[number]>>
> & {
  signal?: AbortSignal;
  context?: Merge<ContextOf<DeclOf<TLinks[number]>>>;
};

export type TrpcClient<TRouter, TOpts> = DecorateRouter<TRouter, TOpts> & {
  readonly '~opts'?: TOpts;
};
type DecorateRouter<TRouter, TOpts> = {
  [K in keyof TRouter]: TRouter[K] extends Procedure<
    infer TType,
    infer I,
    infer O,
    any
  >
    ? TType extends 'query'
      ? { query(input: I, opts?: TOpts): Promise<Awaited<O>> }
      : { mutate(input: I, opts?: TOpts): Promise<Awaited<O>> }
    : DecorateRouter<TRouter[K], TOpts>;
};

export interface Type<T> {
  readonly '~type': T;
}
/** `type<T>()` from proposal 05: a value that only carries a type. */
export declare function type<T>(): Type<T>;

export declare function httpLink(opts: {
  url: string;
}): TrpcLink<{ context: { headers?: Record<string, string> } }>;
export declare function cacheLink(): TrpcLink<{
  options: { ignoreCache?: boolean };
}>;
export declare function retryLink(): TrpcLink<{
  options: { retries?: number };
}>;
export declare function loggerLink(): TrpcLink;

export declare function splitLink<
  TRouter = any,
  TTrue extends AnyLink = AnyLink,
  TFalse extends AnyLink = AnyLink,
>(opts: {
  condition: (op: Operation<RouterPaths<TRouter>>) => boolean;
  true: TTrue;
  false: TFalse;
}): TrpcLink<DeclOf<TTrue> | DeclOf<TFalse>, TRouter>;

// --- fixture router ----------------------------------------------------------

export interface Post {
  id: string;
  title: string;
}
export type AppRouter = {
  post: {
    byId: Procedure<'query', { id: string }, Post, never>;
    create: Procedure<'mutation', { title: string }, Post, never>;
  };
  health: Procedure<'query', void, 'ok', never>;
};
