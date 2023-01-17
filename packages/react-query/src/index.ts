import { AnyProcedure, inferProcedureInput } from '@trpc/server';
import { QueryType, getArrayQueryKey } from './internals/getArrayQueryKey';
import { getQueryKey as $getQueryKey } from './internals/getQueryKey';
import { DecorateProcedure } from './shared';

export * from '@trpc/client';

export { createTRPCReact, type CreateTRPCReact } from './createTRPCReact';
export { createReactQueryHooks } from './interop';
export type { inferReactQueryProcedureOptions } from './utils/inferReactQueryProcedure';

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
    $getQueryKey(dotPath, input),
    type ?? 'any',
  );
  return queryKey;
}
