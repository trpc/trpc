import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
  return Array.isArray(value) ? value : [value];
}
/**
 * Sends each operation down one of two link chains, based on `condition`.
 *
 * @see https://trpc.io/docs/client/links/splitLink
 */
export function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  /**
   * Picks the chain for an operation.
   */
  condition: (op: Operation) => boolean;
  /**
   * The link to execute next if the test function returns `true`.
   */
  true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TRPCLink<TRouter> | TRPCLink<TRouter>[];
}): TRPCLink<TRouter> {
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
