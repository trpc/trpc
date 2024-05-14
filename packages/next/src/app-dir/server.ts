/// <reference types="next" />
import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import type { CreateContextCallback } from '@trpc/server';
import type {
  AnyProcedure,
  AnyRootTypes,
  AnyRouter,
  ErrorHandlerOptions,
  inferClientTypes,
  inferProcedureInput,
  MaybePromise,
  RootConfig,
  Simplify,
  TRPCResponse,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createRecursiveProxy,
  getErrorShape,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  TRPCError,
} from '@trpc/server/unstable-core-do-not-import';
import { revalidateTag } from 'next/cache';
import { isNotFoundError } from 'next/dist/client/components/not-found';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { cache } from 'react';
import { formDataToObject } from './formDataToObject';
import type {
  ActionHandlerDef,
  CreateTRPCNextAppRouterOptions,
  inferActionDef,
} from './shared';
import { generateCacheTag, isFormData } from './shared';
import type { NextAppDirDecorateRouterRecord } from './types';

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const action = pathCopy.pop()!;
    const procedurePath = pathCopy.join('.');
    const procedureType = clientCallTypeToProcedureType(action);
    const cacheTag = generateCacheTag(procedurePath, callOpts.args[0]);

    if (action === 'revalidate') {
      revalidateTag(cacheTag);
      return;
    }

    return (client[procedureType] as any)(procedurePath, ...callOpts.args);
  }) as NextAppDirDecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;
}

/**
 * Rethrow errors that should be handled by Next.js
 */
const throwNextErrors = (error: TRPCError) => {
  const { cause } = error;
  if (isRedirectError(cause) || isNotFoundError(cause)) {
    throw error.cause;
  }
};
/**
 * @internal
 */
export type TRPCActionHandler<TDef extends ActionHandlerDef> = (
  input: FormData | TDef['input'],
) => Promise<TRPCResponse<TDef['output'], TDef['errorShape']>>;

export function experimental_createServerActionHandler<
  TInstance extends {
    _config: RootConfig<AnyRootTypes>;
  },
>(
  t: TInstance,
  opts: CreateContextCallback<
    TInstance['_config']['$types']['ctx'],
    () => MaybePromise<TInstance['_config']['$types']['ctx']>
  > & {
    /**
     * Transform form data to a `Record` before passing it to the procedure
     * @default true
     */
    normalizeFormData?: boolean;
    /**
     * Called when an error occurs in the handler
     */
    onError?: (
      opts: ErrorHandlerOptions<TInstance['_config']['$types']['ctx']>,
    ) => void;

    /**
     * Rethrow errors that should be handled by Next.js
     * @default true
     */
    rethrowNextErrors?: boolean;
  },
) {
  const config = t._config;
  const {
    normalizeFormData = true,
    createContext,
    rethrowNextErrors = true,
  } = opts;

  const transformer = config.transformer;

  // TODO allow this to take a `TRouter` in addition to a `AnyProcedure`
  return function createServerAction<TProc extends AnyProcedure>(
    proc: TProc,
  ): TRPCActionHandler<
    Simplify<inferActionDef<inferClientTypes<TInstance>, TProc>>
  > {
    return async function actionHandler(
      rawInput: FormData | inferProcedureInput<TProc>,
    ) {
      let ctx: TInstance['_config']['$types']['ctx'] | undefined = undefined;
      try {
        ctx = (await createContext?.()) ?? {};
        if (normalizeFormData && isFormData(rawInput)) {
          // Normalizes FormData so we can use `z.object({})` etc on the server
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

        const data = proc._def.experimental_caller
          ? await proc(rawInput as any)
          : await proc({
              input: undefined,
              ctx,
              path: '',
              getRawInput: async () => rawInput,
              type: proc._def.type,
            });

        const transformedJSON = transformTRPCResponse(config, {
          result: {
            data,
          },
        });
        return transformedJSON;
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);

        opts.onError?.({
          ctx,
          error,
          input: rawInput,
          path: '',
          type: proc._def.type,
        });

        rethrowNextErrors && throwNextErrors(error);

        const shape = getErrorShape({
          config,
          ctx,
          error,
          input: rawInput,
          path: '',
          type: proc._def.type,
        });

        return transformTRPCResponse(t._config, {
          error: shape,
        });
      }
    } as TRPCActionHandler<
      inferActionDef<TInstance['_config']['$types'], TProc>
    >;
  };
}

// ts-prune-ignore-next
export async function experimental_revalidateEndpoint(req: Request) {
  const { cacheTag } = await req.json();

  if (typeof cacheTag !== 'string') {
    return new Response(
      JSON.stringify({
        revalidated: false,
        error: 'cacheTag must be a string',
      }),
      { status: 400 },
    );
  }

  revalidateTag(cacheTag);
  return new Response(JSON.stringify({ revalidated: true, now: Date.now() }), {
    status: 200,
  });
}
