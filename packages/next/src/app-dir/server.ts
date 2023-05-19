/// <reference types="next" />
import {
  CreateTRPCProxyClient,
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyRootConfig,
  AnyRouter,
  CombinedDataTransformer,
  MaybePromise,
  TRPCError,
  getTRPCErrorFromUnknown,
  inferHandlerInput,
  inferProcedureInput,
} from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import {
  createRecursiveProxy,
  getErrorShape,
  inferTransformedProcedureOutput,
  transformTRPCResponse,
} from '@trpc/server/shared';
import { cache } from 'react';
import { formDataToObject } from './formDataToObject';
import { CreateTRPCNextAppRouterOptions, isFormData } from './shared';

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
  input: inferHandlerInput<TProcedure>[0] | FormData,
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
  TInstance extends {
    _config: AnyRootConfig;
  },
>(
  t: TInstance,
  opts: {
    createContext: () => MaybePromise<TInstance['_config']['$types']['ctx']>;
    /**
     * Transform form data to a `Record` before passing it to the procedure
     * @default true
     */
    normalizeFormData?: boolean;
  },
) {
  const config = t._config;
  const { normalizeFormData = true, createContext } = opts;

  const transformer = config.transformer as CombinedDataTransformer;

  // TODO allow this to take a `TRouter` in addition to a `AnyProcedure`
  return function createServerAction<TProc extends AnyProcedure>(
    proc: TProc,
  ): TRPCActionHandler<TProc> {
    return async function actionHandler(
      rawInput: inferProcedureInput<TProc> | FormData,
    ) {
      const ctx: undefined | TInstance['_config']['$types']['ctx'] = undefined;
      try {
        const ctx = await createContext();
        if (normalizeFormData && isFormData(rawInput)) {
          // Normalizes formdata so we can use `z.object({})` etc on the server
          try {
            rawInput = formDataToObject(rawInput);
          } catch {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to parse form data',
            });
          }
        } else if (rawInput && !isFormData(rawInput)) {
          rawInput = transformer.input.deserialize(rawInput);
        }

        const data = await proc({
          input: undefined,
          ctx,
          path: 'serverAction',
          rawInput,
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
          input: rawInput,
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
