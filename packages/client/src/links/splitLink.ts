import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { createChain } from './internals/createChain';
import { Operation, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]) {
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
   * If it is not provided, the `next` function is used to call the link after `splitLink`
   */
  false?: TRPCLink<TRouter> | TRPCLink<TRouter>[];
}): TRPCLink<TRouter> {
  return (runtime) => {
    const yes = asArray(opts.true).map((link) => link(runtime));
    const no = opts.false
      ? asArray(opts.false).map((link) => link(runtime))
      : [];
    return (props) => {
      return observable((observer) => {
        const passesCondition = opts.condition(props.op);
        if (passesCondition === false && !opts.false) {
          return props.next(props.op).subscribe(observer);
        }
        const links = passesCondition ? yes : no;
        return createChain({ op: props.op, links }).subscribe(observer);
      });
    };
  };
}
