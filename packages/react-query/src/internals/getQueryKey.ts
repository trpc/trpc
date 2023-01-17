import { AnyProcedure, AnyRouter, inferProcedureInput } from '@trpc/server';
import { QueryType, getArrayQueryKey } from '../internals/getArrayQueryKey';
import { DecorateProcedure } from '../shared';

/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
export function getQueryKeyInternal(
  path: string,
  input: unknown,
): [string] | [string, unknown] {
  if (path.length) return input === undefined ? [path] : [path, input];
  return [] as unknown as [string];
}

/**
 * Method to extract the query key for a procedure
 * @param type - defaults to `any`
 * @link https://trpc.io/docs/useContext#-the-function-i-want-isnt-here
 */
export function getQueryKey<
  TProcedure extends AnyProcedure,
  TPath extends string,
  TFlags,
>(
  procedure: DecorateProcedure<TProcedure, TFlags, TPath>,
  ..._params: inferProcedureInput<TProcedure> extends undefined
    ? []
    : [input: inferProcedureInput<TProcedure>, type?: QueryType]
) {
  const [input, type] = _params;
  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedure._def().path as string[];
  const dotPath = path.join('.');
  const queryKey = getArrayQueryKey(
    getQueryKeyInternal(dotPath, input),
    type ?? 'any',
  );
  return queryKey;
}
