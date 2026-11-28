import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type {
  inferLinksDeclaredContext,
  Operation,
  OperationContext,
  TRPCLink,
} from './types';

function asArray<TType>(value: TType | readonly TType[]): readonly TType[] {
  return Array.isArray(value) ? value : [value as TType];
}

/**
 * A `splitLink` branch: one link or a chain of them.
 * @internal
 */
type SplitLinkBranch<TRouter extends AnyRouter> =
  | TRPCLink<TRouter, any>
  | readonly TRPCLink<TRouter, any>[];

// a tuple, so links whose declarations nest aren't merged into one
type asLinks<TBranch> = TBranch extends readonly unknown[]
  ? TBranch
  : [TBranch];

interface SplitLinkOptions<
  TRouter extends AnyRouter,
  TTrue extends SplitLinkBranch<TRouter>,
  TFalse extends SplitLinkBranch<TRouter>,
  TContext extends object,
> {
  /**
   * Picks the chain for an operation. Type its `context` to declare the
   * fields it reads.
   */
  condition: (op: Operation<unknown, TContext>) => boolean;
  /**
   * The link to execute next if the test function returns `true`.
   */
  true: TTrue;
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TFalse;
}

type SplitLink<
  TRouter extends AnyRouter,
  TTrue extends SplitLinkBranch<TRouter>,
  TFalse extends SplitLinkBranch<TRouter>,
  TContext extends object,
> = TRPCLink<
  TRouter,
  {
    context: TContext &
      inferLinksDeclaredContext<[...asLinks<TTrue>, ...asLinks<TFalse>]>;
  }
>;

/**
 * Sends each operation down one of two link chains, based on `condition`.
 *
 * Calls take the `context` both chains read, plus what `condition` reads.
 * Type `condition`'s `context` to declare it; otherwise `condition` may
 * read any field.
 * @example
 * splitLink({
 *   condition: ({ context }: { context: { skipBatch?: boolean } }) =>
 *     context.skipBatch === true,
 *   true: httpLink({ url }),
 *   false: httpBatchLink({ url }),
 * })
 *
 * @see https://trpc.io/docs/client/links/splitLink
 */
// First: a `condition` with no typed `context` may read any field. A
// single generic signature would infer its context from where the link is
// used instead.
export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  const TTrue extends SplitLinkBranch<TRouter> = TRPCLink<TRouter>,
  const TFalse extends SplitLinkBranch<TRouter> = TRPCLink<TRouter>,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, OperationContext>,
): SplitLink<TRouter, TTrue, TFalse, OperationContext>;
export function splitLink<
  TRouter extends AnyRouter,
  const TTrue extends SplitLinkBranch<TRouter>,
  const TFalse extends SplitLinkBranch<TRouter>,
  TContext extends object,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, TContext>,
): SplitLink<TRouter, TTrue, TFalse, TContext>;
export function splitLink(
  opts: SplitLinkOptions<
    AnyRouter,
    SplitLinkBranch<AnyRouter>,
    SplitLinkBranch<AnyRouter>,
    any
  >,
): TRPCLink<AnyRouter> {
  return (runtime) => {
    const yes = asArray(opts.true).map((link) => link(runtime));
    const no = asArray(opts.false).map((link) => link(runtime));
    return (props) => {
      return observable((observer) => {
        const links = opts.condition(props.op) ? yes : no;
        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
