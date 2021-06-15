import { AnyRouter } from '@trpc/server';
import { TRPCLink, Operation } from './core';

export function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  /**
   * The link to execute next if the test function returns `true`.
   */
  left: TRPCLink<TRouter>;
  /**
   * The link to execute next if the test function returns `false`.
   */
  right: TRPCLink<TRouter>;
  condition: (op: Operation) => boolean;
}): TRPCLink<TRouter> {
  return (rt) => {
    const left = opts.left(rt);
    const right = opts.right(rt);
    return (props) => {
      opts.condition(props.op) ? left(props) : right(props);
    };
  };
}
