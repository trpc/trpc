import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type {
  inferLinksDeclaredContext,
  inferLinksUnsupported,
  Operation,
  OperationContext,
  TRPCLink,
} from './types';

function asArray<TType>(value: TType | readonly TType[]): readonly TType[] {
  return Array.isArray(value) ? value : [value as TType];
}
interface SplitLinkOptions<
  TRouter extends AnyRouter,
  TTrue extends TRPCLink<TRouter, any>,
  TFalse extends TRPCLink<TRouter, any>,
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
  true: TTrue | readonly TTrue[];
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TFalse | readonly TFalse[];
}

type SplitLink<
  TRouter extends AnyRouter,
  TTrue extends TRPCLink<TRouter, any>,
  TFalse extends TRPCLink<TRouter, any>,
  TContext extends object,
> = TRPCLink<
  TRouter,
  {
    context: TContext & inferLinksDeclaredContext<[TTrue, TFalse]>;
    unsupported: inferLinksUnsupported<[TTrue]> &
      inferLinksUnsupported<[TFalse]>;
  }
>;

/**
 * Sends each operation down one of two link chains, based on `condition`.
 *
 * Calls take the `context` both chains read, plus what `condition` reads.
 * Type `condition`'s `context` to declare it; otherwise `condition` may
 * read any field. An operation type is unsupported only when neither chain
 * carries it.
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
  TTrue extends TRPCLink<TRouter, any> = TRPCLink<TRouter>,
  TFalse extends TRPCLink<TRouter, any> = TRPCLink<TRouter>,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, OperationContext>,
): SplitLink<TRouter, TTrue, TFalse, OperationContext>;
export function splitLink<
  TRouter extends AnyRouter,
  TTrue extends TRPCLink<TRouter, any>,
  TFalse extends TRPCLink<TRouter, any>,
  TContext extends object,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse, TContext>,
): SplitLink<TRouter, TTrue, TFalse, TContext>;
export function splitLink(
  opts: SplitLinkOptions<
    AnyRouter,
    TRPCLink<AnyRouter>,
    TRPCLink<AnyRouter>,
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
