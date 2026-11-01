/**
 * The typing `.agent-docs/open/http-link-subscriptions-flag.md` proposes:
 * B removes `.subscribe()` for a `subscriptions` that may be `false` (a
 * `boolean`), as `batch: boolean` counts as on. A is `httpLink` as it is.
 */
import type { HttpLinkOptions, TrpcLink, httpLink } from '@trpc12/trpc/client';

type DeclOf<L> = L extends TrpcLink<infer D> ? D : never;

/** Whether `subscriptions` may be `false`. */
type MayBeOff<TOpts> = TOpts extends { subscriptions?: infer S }
  ? [Exclude<S, undefined>] extends [true]
    ? false
    : [Exclude<S, undefined>] extends [never]
      ? false
      : true
  : false;

/** B: `httpLink`, which keeps `.subscribe()` only for no `subscriptions` or a literal `true`. */
export declare function httpLinkB<TOpts extends HttpLinkOptions>(
  opts: TOpts,
): TrpcLink<
  DeclOf<ReturnType<typeof httpLink<Omit<TOpts, 'subscriptions'>>>> &
    (MayBeOff<TOpts> extends true ? { unsupported: 'subscription' } : {})
>;
