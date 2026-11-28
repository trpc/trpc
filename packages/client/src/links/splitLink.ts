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

// a field the call leaves out, or sets to `undefined`, takes its default
function withDefaults(
  defaults: object,
  context: OperationContext,
): OperationContext {
  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined),
    ),
  };
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
   * Picks the chain for an operation.
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
 * Calls take the `context` both chains read. Give `context` defaults to
 * declare the fields `condition` reads; without them, `condition` may read
 * any field.
 * @example
 * splitLink({
 *   context: { skipBatch: false },
 *   condition: (op) => op.context.skipBatch,
 *   true: httpLink({ url }),
 *   false: httpBatchLink({ url }),
 * })
 *
 * @see https://trpc.io/docs/client/links/splitLink
 */
export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  const TTrue extends SplitLinkBranch<TRouter> = TRPCLink<TRouter>,
  const TFalse extends SplitLinkBranch<TRouter> = TRPCLink<TRouter>,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, OperationContext> & {
    context?: never;
  },
): SplitLink<TRouter, TTrue, TFalse, OperationContext>;
export function splitLink<
  TRouter extends AnyRouter,
  const TTrue extends SplitLinkBranch<TRouter>,
  const TFalse extends SplitLinkBranch<TRouter>,
  TContext extends object,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, TContext> & {
    /**
     * Values for the `context` fields `condition` reads, used when a call
     * leaves one out. Their types are the fields calls can pass.
     */
    context: TContext;
  },
): SplitLink<TRouter, TTrue, TFalse, TContext>;
export function splitLink(
  opts: SplitLinkOptions<
    AnyRouter,
    SplitLinkBranch<AnyRouter>,
    SplitLinkBranch<AnyRouter>,
    any
  > & { context?: object },
): TRPCLink<AnyRouter> {
  return (runtime) => {
    const yes = asArray(opts.true).map((link) => link(runtime));
    const no = asArray(opts.false).map((link) => link(runtime));
    return (props) => {
      return observable((observer) => {
        const op = opts.context
          ? {
              ...props.op,
              context: withDefaults(opts.context, props.op.context),
            }
          : props.op;
        const links = opts.condition(op) ? yes : no;
        return createChain({ op, links }).subscribe(observer);
      });
    };
  };
}
