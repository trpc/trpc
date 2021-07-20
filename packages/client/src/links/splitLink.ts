import { AnyRouter } from '@trpc/server';
import { TRPCLink, Operation } from './core';

export function splitLink<TRouter extends AnyRouter = AnyRouter>(
  opts: {
    condition: (op: Operation) => boolean;
  } & (
    | {
        /**
         * The link to execute next if the test function returns `true`.
         * @deprecated use `true`
         */
        left: TRPCLink<TRouter>;
        /**
         * The link to execute next if the test function returns `false`.
         * @deprecated use `false`
         */
        right: TRPCLink<TRouter>;
      }
    | {
        /**
         * The link to execute next if the test function returns `true`.
         */
        true: TRPCLink<TRouter>;
        /**
         * The link to execute next if the test function returns `false`.
         */
        false: TRPCLink<TRouter>;
      }
  ),
): TRPCLink<TRouter> {
  return (rt) => {
    const links =
      'left' in opts
        ? {
            true: opts.left,
            false: opts.right,
          }
        : opts;

    const yes = links.true(rt);
    const no = links.false(rt);
    return (props) => {
      opts.condition(props.op) ? yes(props) : no(props);
    };
  };
}
