/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureRouterRecord,
  ProcedureType,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import { TRPCClient as Client } from './internals/TRPCClient';

type Resolver<TProcedure extends Procedure<any>> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<inferProcedureOutput<TProcedure>>;

type DecorateProcedure<TProcedure extends Procedure<any>> = OmitNeverKeys<{
  query: TProcedure extends { _query: true } ? Resolver<TProcedure> : never;

  mutate: TProcedure extends { _mutation: true } ? Resolver<TProcedure> : never;

  subscribe: TProcedure extends { _subscription: true }
    ? Resolver<TProcedure>
    : never;
}>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : DecorateProcedure<assertProcedure<TProcedures[TKey]>>;
};

const clientCallTypeMap: Record<keyof DecorateProcedure<any>, ProcedureType> = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
};

export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    const clientCallType = pathCopy.pop()! as keyof DecorateProcedure<any>;
    const procedureType = clientCallTypeMap[clientCallType];

    const fullPath = pathCopy.join('.');
    return (client as any)[procedureType](fullPath, ...args);
  });
  return proxy as DecoratedProcedureRecord<TRouter['_def']['record']>;
}
