/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  Procedure,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import { TRPCClient as Client } from './internals/TRPCClient';

type DecorateProcedure<TProcedure extends Procedure<any>> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<inferProcedureOutput<TProcedure>>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : DecorateProcedure<assertProcedure<TProcedures[TKey]>>;
};

export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    let type = pathCopy.pop()!;
    if (type === 'mutate') {
      type = 'mutation';
    }
    const fullPath = pathCopy.join('.');
    return (client as any)[type](fullPath, ...args);
  });
  return proxy as DecoratedProcedureRecord<TRouter['_def']['record']>;
}
