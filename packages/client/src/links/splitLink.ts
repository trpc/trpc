import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type {
  inferLinksContext,
  inferLinksUnsupported,
  Operation,
  OperationContext,
  TRPCLink,
} from './types';

function asArray<TType>(value: TType | readonly TType[]): readonly TType[] {
  return Array.isArray(value) ? value : [value as TType];
}
/**
 * Sends each operation down one of two link chains, based on `condition`.
 *
 * Calls take the `context` both chains read, plus anything, since
 * `condition` may read any field. An operation type is unsupported only
 * when neither chain carries it.
 *
 * @see https://trpc.io/docs/client/links/splitLink
 */
export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  TTrue extends TRPCLink<TRouter, any> = TRPCLink<TRouter>,
  TFalse extends TRPCLink<TRouter, any> = TRPCLink<TRouter>,
>(opts: {
  /**
   * Picks the chain for an operation.
   */
  condition: (op: Operation) => boolean;
  /**
   * The link to execute next if the test function returns `true`.
   */
  true: TTrue | readonly TTrue[];
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TFalse | readonly TFalse[];
}): TRPCLink<
  TRouter,
  {
    context: OperationContext & inferLinksContext<[TTrue, TFalse]>;
    unsupported: inferLinksUnsupported<[TTrue]> &
      inferLinksUnsupported<[TFalse]>;
  }
> {
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
