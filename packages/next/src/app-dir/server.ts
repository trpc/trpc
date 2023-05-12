/// <reference types="next" />
import {
  CreateTRPCProxyClient,
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyRouter,
  MaybePromise,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { AnyTRPCInstance, createRecursiveProxy } from '@trpc/server/shared';
import { cache } from 'react';
import { CreateTRPCNextAppRouterOptions } from './shared';

// ts-prune-ignore-next
export function experimental_createTRPCNextAppDirServer<
  TRouter extends AnyRouter,
>(opts: CreateTRPCNextAppRouterOptions<TRouter>) {
  const getClient = cache(() => {
    const config = opts.config();
    return createTRPCUntypedClient(config);
  });

  return createRecursiveProxy((callOpts) => {
    // lazily initialize client
    const client = getClient();

    const pathCopy = [...callOpts.path];
    const procedureType = clientCallTypeToProcedureType(
      pathCopy.pop() as string,
    );
    const fullPath = pathCopy.join('.');

    return (client[procedureType] as any)(fullPath, ...callOpts.args);
  }) as CreateTRPCProxyClient<TRouter>;
}

/**
 * @internal
 */
export type TRPCActionHandler<TProcedure extends AnyProcedure> = ((
  ...args: inferHandlerInput<TProcedure>
) => inferProcedureOutput<TProcedure>) & {
  $proc: TProcedure;
};

/**
 * @internal
 */
export type AnyTRPCActionHandler = TRPCActionHandler<AnyProcedure>;

export function experimental_createServerActionHandler<
  TInstance extends AnyTRPCInstance,
>(
  _t: AnyTRPCInstance,
  opts: {
    createContext: () => MaybePromise<TInstance['_config']['$types']['ctx']>;
  },
) {
  // TODO allow this to take a `TRouter` in addition to a `AnyProcedure`
  return function createServerAction<TProc extends AnyProcedure>(
    proc: TProc,
  ): TRPCActionHandler<TProc> {
    console.log('setup action');
    return async function actionHandler(input: inferProcedureInput<TProc>) {
      console.log('---------hello', input);
      // TODO error handling
      // TODO transformers
      // TODO normalize FormData?
      return proc({
        input: undefined,
        ctx: await opts.createContext(),
        path: 'serverAction',
        rawInput: input,
        type: proc._type,
      }) as inferProcedureOutput<TProc> & {
        $proc: TProc;
      };
    } as TRPCActionHandler<TProc>;
  };
}
