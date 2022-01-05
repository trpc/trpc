import { AnyRouter } from '@trpc/server';
import { observable } from '../rx/observable';
import { TRPCLink, Operation, createChain } from './core';

function asArray<T>(value: T | T[]) {
  return Array.isArray(value) ? value : [value];
}
export function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
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
  return (rt) => {
    const yes = asArray(opts.true).map((link) => link(rt));
    const no = asArray(opts.false).map((link) => link(rt));
    return (props) => {
      return observable((observer) => {
        const links = opts.condition(props.op) ? yes : no;
        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
