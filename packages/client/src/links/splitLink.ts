import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import type { Operation, OperationLink, TRPCLink } from './types';

function asArray<TType>(value: TType | TType[]): TType[] {
  return Array.isArray(value) ? value : [value];
}
/**
 * Creates a link that splits operations between different links based on a condition
 * @param opts Configuration object for the split link
 * @param opts.condition Function that determines which link(s) to use for an operation
 * @param opts.true Link(s) to use when condition returns true (only when using boolean condition)
 * @param opts.false Link(s) to use when condition returns false (only when using boolean condition)
 * @param opts.options Record of links mapped to custom condition values (only when using string condition)
 * @example
 * ```ts
 * // Boolean split example
 * splitLink({
 *   condition: (op) => op.type === 'query',
 *   true: queryLink,
 *   false: mutationLink
 * })
 *
 * // Custom split example
 * splitLink({
 *   condition: (op) => op.context.server as 'serverA' | 'serverB',
 *   options: {
 *     serverA: serverALink,
 *     serverB: serverBLink
 *   }
 * })
 * ```
 */
export function splitLink<
  TRouter extends AnyRouter = AnyRouter,
  TOptions extends string = never,
>(
  opts:
    | {
        condition: (op: Operation) => boolean;
        /**
         * The link(s) to execute next if the test function returns `true`.
         */
        true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
        /**
         * The link(s) to execute next if the test function returns `false`.
         */
        false: TRPCLink<TRouter> | TRPCLink<TRouter>[];
        /**
         * Define custom keys for the options
         */
        options?: never;
      }
    | {
        condition: (op: Operation) => TOptions;
        /**
         * Define custom keys for the options
         */
        options: Record<
          NoInfer<TOptions>,
          TRPCLink<TRouter> | TRPCLink<TRouter>[]
        >;
      },
): TRPCLink<TRouter> {
  type $OptionRecord = Record<any, TRPCLink<TRouter> | TRPCLink<TRouter>[]>;
  const options: $OptionRecord = opts.options ?? {
    true: (opts as any).true,
    false: (opts as any).false,
  };
  return (runtime) => {
    const operationLinkRecord = Object.keys(options).reduce(
      (acc, key) => {
        acc[key] = asArray(options[key]).map(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (link) => link!(runtime),
        );

        return acc;
      },
      {} as Record<keyof $OptionRecord, OperationLink<TRouter>[]>,
    );

    return (props) =>
      observable((observer) => {
        const answerKey = opts.condition(props.op);

        const links = operationLinkRecord[
          answerKey
        ] as OperationLink<TRouter>[];

        return createChain({ op: props.op, links }).subscribe(observer);
      });
  };
}
