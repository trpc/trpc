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
  getTRPCErrorFromUnknown,
  inferHandlerInput,
  inferProcedureInput,
} from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import {
  AnyTRPCInstance,
  createRecursiveProxy,
  getErrorShape,
  inferTransformedProcedureOutput,
  transformTRPCResponse,
} from '@trpc/server/shared';
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
) => Promise<
  TRPCResponse<
    inferTransformedProcedureOutput<TProcedure>,
    TProcedure['_def']['_config']['$types']['errorShape']
  >
>) & {
  // TODO: make this a Symbol?
  $proc: TProcedure;
};
/**
 * @internal
 */
export type AnyTRPCActionHandler = TRPCActionHandler<AnyProcedure>;

export function experimental_createServerActionHandler<
  TInstance extends AnyTRPCInstance,
>(
  t: AnyTRPCInstance,
  opts: {
    createContext: () => MaybePromise<TInstance['_config']['$types']['ctx']>;
  },
) {
  const config = t._config;
  // TODO allow this to take a `TRouter` in addition to a `AnyProcedure`
  return function createServerAction<TProc extends AnyProcedure>(
    proc: TProc,
  ): TRPCActionHandler<TProc> {
    return async function actionHandler(input: inferProcedureInput<TProc>) {
      // TODO normalize FormData so we can call the fn the same no matter of context?
      const ctx: undefined | TInstance['_config']['$types']['ctx'] = undefined;
      try {
        const ctx = await opts.createContext();
        const data = await proc({
          input: undefined,
          ctx,
          path: 'serverAction',
          rawInput: input,
          type: proc._type,
        });

        const transformedJSON = transformTRPCResponse(config, {
          result: {
            data,
          },
        });
        return transformedJSON;
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        const shape = getErrorShape({
          config,
          ctx,
          error,
          input,
          path: 'serverAction',
          type: proc._type,
        });

        // TODO: send the right HTTP header?!

        return transformTRPCResponse(t._config, {
          // FIXME: typecast shouldn't be needed
          error: shape as any,
        });
      }
    } as TRPCActionHandler<TProc>;
  };
}
