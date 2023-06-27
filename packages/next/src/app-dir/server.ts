/// <reference types="next" />
import {
  clientCallTypeToProcedureType,
  CreateTRPCProxyClient,
  createTRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyRootConfig,
  AnyRouter,
  CombinedDataTransformer,
  getTRPCErrorFromUnknown,
  inferProcedureInput,
  MaybePromise,
  Simplify,
  TRPCError,
} from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import {
  createRecursiveProxy,
  getErrorShape,
  transformTRPCResponse,
} from '@trpc/server/shared';
import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import { formDataToObject } from './formDataToObject';
import {
  ActionHandlerDef,
  CreateTRPCNextAppRouterOptions,
  inferActionDef,
  isFormData,
} from './shared';
import { DecorateProcedureServer } from './types';

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
    const action = pathCopy.pop() as string;

    const procedurePath = pathCopy.join('.');
    const procedureType = clientCallTypeToProcedureType(action);

    if (action === '_def') {
      // internal attribute used to get the procedure path
      // used in server actions to find the procedure from the client proxy
      return {
        path: procedurePath,
      };
    }

    return (client[procedureType] as any)(procedurePath, ...callOpts.args);
  }) as CreateTRPCProxyClient<TRouter>;
}

/**
 * @internal
 */
export type TRPCActionHandler<TDef extends ActionHandlerDef> = (
  input: TDef['input'] | FormData,
) => Promise<TRPCResponse<TDef['output'], TDef['errorShape']>>;

type AnyTInstance = { _config: AnyRootConfig };

type CreateActionHandlerOptions<
  TInstance extends AnyTInstance,
  TRouter extends AnyRouter,
> =
  | {
      t: TInstance;
      router?: never;
    }
  | {
      t?: never;
      router: TRouter;
    };

export function experimental_createServerActionHandler<
  TInstance extends AnyTInstance,
  TRouter extends AnyRouter,
>(
  opts: CreateActionHandlerOptions<TInstance, TRouter> & {
    createContext: () => MaybePromise<TInstance['_config']['$types']['ctx']>;
    /**
     * Transform form data to a `Record` before passing it to the procedure
     * @default true
     */
    normalizeFormData?: boolean;
  },
) {
  const config = opts.t ? opts.t._config : opts.router?._def._config;
  if (!config) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `'experimental_createServerActionHandler' was called with invalid arguments. Expected a either a router or a root instance to be present, but none was found.`,
    });
  }

  const { normalizeFormData = true, createContext } = opts;
  const transformer = config.transformer as CombinedDataTransformer;

  return function createServerAction<TProcedure extends AnyProcedure>(
    proc: TProcedure | DecorateProcedureServer<TProcedure>,
  ): TRPCActionHandler<Simplify<inferActionDef<TProcedure>>> {
    const procedure: TProcedure = (() => {
      if (typeof proc === 'function' && typeof proc._type === 'string') {
        // proc is a Procedure, proceed
        return proc;
      }

      // proc is a DecoratedProcedure, extract the procedure from the router
      if (!opts.router) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `'createServerAction' was called with invalid arguments. Expected a router to be present, but none was found.`,
        });
      }

      const record = opts.router._def.record;
      const path = (proc as any)._def().path;
      const procedure = record[path];

      if (!procedure) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No procedure matching path "${path}"`,
        });
      }

      return procedure;
    })();

    return async function actionHandler(
      rawInput: inferProcedureInput<TProcedure> | FormData,
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
              message: 'Failed to convert FormData to an object',
            });
          }
        } else if (rawInput && !isFormData(rawInput)) {
          rawInput = transformer.input.deserialize(rawInput);
        }

        const data = await procedure({
          input: undefined,
          ctx,
          path: 'serverAction',
          rawInput,
          type: procedure._type,
        });

        // FIXME: This should be configurable to do fine-grained revalidation
        // Need https://github.com/trpc/trpc/pull/4375 for that
        revalidatePath('/alt-server-action');

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
          type: procedure._type,
        });

        // TODO: send the right HTTP header?!

        return transformTRPCResponse(config, {
          error: shape,
        });
      }
    } as TRPCActionHandler<inferActionDef<TProcedure>>;
  };
}
