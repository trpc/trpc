import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
  return Array.isArray(value) ? value : [value];
}
export function trisectLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  condition: (op: Operation) => 0 | 1 | 2;
  /**
   * The link to execute next if the test function returns `0`.
   */
  0: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  /**
   * The link to execute next if the test function returns `1`.
   */
  1: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  /**
   * The link to execute next if the test function returns `2`.
   */
  2: TRPCLink<TRouter> | TRPCLink<TRouter>[];
}): TRPCLink<TRouter> {
  return (runtime) => {
    const link0 = asArray(opts[0]).map((link) => link(runtime));
    const link1 = asArray(opts[1]).map((link) => link(runtime));
    const link2 = asArray(opts[2]).map((link) => link(runtime));
    return (props) => {
      return observable((observer) => {
        const links = opts.condition(props.op) === 0 ? link0 : opts.condition(props.op) === 1 ? link1 : link2;

        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}

