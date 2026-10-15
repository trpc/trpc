import type {
  AnyLink,
  CallOptions,
  TrpcClient,
  TrpcLink,
  Type,
} from './core.ts';

/** D-A: curried. `createTrpcClient<AppRouter>()({ links })` */
export declare function createClientA<TRouter>(): <
  TLinks extends readonly TrpcLink<any, TRouter>[],
>(opts: {
  links: TLinks;
}) => TrpcClient<TRouter, CallOptions<TLinks>>;

/** D-B: second generic. `createTrpcClient<AppRouter, typeof links>({ links })` */
export declare function createClientB<
  TRouter,
  TLinks extends readonly AnyLink[] = readonly AnyLink[],
>(opts: { links: TLinks }): TrpcClient<TRouter, CallOptions<TLinks>>;

/** D-C: router inferred from a value. `createTrpcClient({ router: type<AppRouter>(), links })` */
export declare function createClientC<
  TRouter,
  TLinks extends readonly TrpcLink<any, TRouter>[],
>(opts: {
  router: Type<TRouter>;
  links: TLinks;
}): TrpcClient<TRouter, CallOptions<TLinks>>;

/** D-E: return-type annotation (oRPC). `const c: TrpcClient<AppRouter, CallOptions<typeof links>> = createTrpcClient({ links })` */
export declare function createClientE<TClient>(opts: {
  links: readonly AnyLink[];
}): TClient;

/**
 * D-E, checked: `TClient` is inferred from the annotation (return-type
 * inference), `TLinks` from the argument, and `links` is rejected when the
 * annotation declares options no installed link provides.
 */
export declare function createClientEChecked<
  TClient extends TrpcClient<any, any>,
  const TLinks extends readonly AnyLink[] = readonly AnyLink[],
>(opts: {
  links: TLinks & MissingLinkOptions<TLinks, NonNullable<TClient['~opts']>>;
}): TClient;

type MissingLinkOptions<TLinks extends readonly AnyLink[], TOpts> = [
  Exclude<keyof TOpts, keyof CallOptions<TLinks>>,
] extends [never]
  ? unknown
  : { '~missingLinkOptions': Exclude<keyof TOpts, keyof CallOptions<TLinks>> };
