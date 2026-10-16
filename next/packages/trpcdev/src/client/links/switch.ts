import { Stream } from 'effect';
import { TrpcError } from '../../internal/error.ts';
import {
  chainSerializer,
  chainSwitchNames,
  link,
  runLinks,
  setSwitchNames,
  withSerializer,
  type AnyLink,
  type Operation,
  type TrpcLink,
} from '../link.ts';
import type { RouterPaths } from '../types.ts';
import {
  asArray,
  type BranchesDecl,
  type Chain,
  type ChainDecl,
} from './basic.ts';

/**
 * Names a `switchLink` can't take: the client or the built-in links read
 * them as call options.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ReservedSwitchName =
  | 'signal'
  | 'lastEventId'
  | 'init'
  | 'headers'
  | 'reconnect';

const reserved: ReadonlySet<string> = new Set<ReservedSwitchName>([
  'signal',
  'lastEventId',
  'init',
  'headers',
  'reconnect',
]);

type ChainSwitches<T> =
  ChainDecl<T> extends infer D
    ? D extends { switches: infer S extends string }
      ? S
      : never
    : never;

type SwitchName<TName extends string, TLinks> = string extends TName
  ? 'switchLink name must be a string literal'
  : TName extends ReservedSwitchName
    ? `"${TName}" is a reserved call option`
    : TName extends ChainSwitches<TLinks[keyof TLinks]>
      ? `"${TName}" is already a switchLink in these links`
      : TName;

/**
 * Options for {@link switchLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SwitchLinkOptions<
  TName extends string,
  TLinks extends Record<string, Chain>,
  TRouter = any,
> {
  /**
   * The call option that forces a branch: with `name: 'transport'`, a call
   * passes `{ transport: 'http' }`. Not one of {@link ReservedSwitchName}.
   */
  name: SwitchName<TName, TLinks>;
  /** The branches, by name. A branch is a link or a chain of links. */
  links: TLinks;
  /**
   * The branch for calls that don't force one. With `router:` on the
   * client, `op.path` is the router's paths.
   */
  pick: (
    op: Operation & { readonly path: RouterPaths<TRouter> },
  ) => keyof TLinks & string;
}

/**
 * What {@link switchLink} declares: its call option, plus what its
 * branches declare.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SwitchLinkDecl<
  TName extends string,
  TLinks extends Record<string, Chain>,
> =
  | {
      context: { [K in TName]?: keyof TLinks & string };
      switches: TName;
    }
  | BranchesDecl<TLinks>;

/**
 * Routes each operation to one of several named chains. `pick` chooses one
 * per operation, and a call can force one through the call option `name`
 * declares. `splitLink` is the two-way case without the option.
 *
 * @example
 * ```ts
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [
 *     switchLink({
 *       name: 'transport',
 *       links: { http: httpLink({ url, batch: true }), ws: wsLink({ url: wsUrl }) },
 *       pick: (op) => (op.type === 'subscription' ? 'ws' : 'http'),
 *     }),
 *   ],
 * });
 * await client.report.query(input, { transport: 'http' });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function switchLink<
  const TName extends string,
  const TLinks extends Record<string, Chain>,
  TRouter = any,
>(
  opts: SwitchLinkOptions<TName, TLinks, TRouter>,
): TrpcLink<SwitchLinkDecl<TName, TLinks>, TRouter> {
  const name = opts.name as string;
  if (reserved.has(name)) {
    throw new TypeError(`switchLink name "${name}" is a reserved call option`);
  }
  const branches = new Map<string, ReadonlyArray<AnyLink>>();
  const names = new Set<string>();
  for (const [key, chain] of Object.entries(opts.links)) {
    const links = asArray(chain);
    branches.set(key, links);
    for (const inner of chainSwitchNames(links)) names.add(inner);
  }
  if (names.has(name)) {
    throw new TypeError(`Two switchLinks on one chain are named "${name}"`);
  }
  const switched = link.effect(({ op }) => {
    const forced = (op.context as Record<string, unknown>)[name];
    const key = typeof forced === 'string' ? forced : opts.pick(op as never);
    const chain = branches.get(key);
    if (!chain) {
      return Stream.fail(
        new TrpcError({
          code: 'CLIENT_ERROR',
          message: `switchLink "${name}" has no link "${key}"`,
        }),
      );
    }
    return runLinks(chain, op);
  });
  setSwitchNames(switched, [name, ...names]);
  withSerializer(switched, chainSerializer([...branches.values()].flat()));
  return switched as TrpcLink<any, TRouter>;
}
