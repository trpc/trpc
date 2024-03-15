/// <reference types="next" />
import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  DeepPartial,
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
  TRPCInputValidationError,
  TypedTRPCError,
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
      const ctx: TInstance['_config']['$types']['ctx'] | undefined = undefined;
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

        const data = await proc({
          input: undefined,
          ctx,
          path: 'serverAction',
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
        const shape = getErrorShape({
          config,
          ctx,
          error,
          input: rawInput,
          path: 'serverAction',
          type: proc._def.type,
        });

        // TODO: send the right HTTP header?!

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

type TypedError<TProc extends AnyProcedure> =
  | (Exclude<TProc['_def']['$error'], TRPCInputValidationError> & {
      fieldErrors?: never;
    })
  | (TRPCInputValidationError extends TProc['_def']['$error']
      ? {
          code: 'INPUT_VALIDATION';
          fieldErrors: Partial<
            Record<keyof TProc['_def']['_input_in'], string[]>
          >;
        }
      : never);

type ServerActionState<TProc extends AnyProcedure> =
  | {
      input?: DeepPartial<TProc['_def']['_input_in']>;
    } & (
      | {
          ok: true;
          output: TProc['_def']['_output_out'];
          error?: never;
        }
      | {
          ok: false;
          error: TypedError<TProc>;
          output?: never;
        }
      | {
          ok?: never;
          error?: never;
          output?: never;
        }
    );
type UseFormStateArgs<TProc extends AnyProcedure> =
  // invoked directly
  // ❌ they can't be combined because then the types of `useFormState()` will complain
  // | [
  //
  //     input: FormData | TProc['_def']['_input_in'],
  //   ];
  | [
      // invoked through useFormState
      state: ServerActionState<TProc>,
      input: FormData | TProc['_def']['_input_in'],
    ];
type ServerActionUseFormState<TProc extends AnyProcedure> = (
  ...args: UseFormStateArgs<TProc>
) => Promise<ServerActionState<TProc>>;

/**
 * @deprecated use `ServerActionUseFormState` instead
 */
type ServerActionInvoke<TProc extends AnyProcedure> = (
  input: TProc['_def']['_input_in'] | FormData,
) => Promise<ServerActionState<TProc>>;

type QueryState<TProc extends AnyProcedure> =
  | {
      ok: true;
      output: TProc['_def']['_output_out'];
      error?: never;
    }
  | {
      ok: false;
      error: TypedError<TProc>;
      output?: never;
    };

type Query<TProc extends AnyProcedure> = (
  input: TProc['_def']['_input_in'],
) => Promise<QueryState<TProc>>;

const rethrowNextErrors = (error: TRPCError) => {
  if (isRedirectError(error.cause) || isNotFoundError(error.cause)) {
    throw error.cause;
  }
};

type FieldErrors = {
  [key: string | number | symbol]: string[] | undefined;
};

export function experimental_createDataLayer<
  TInstance extends {
    _config: RootConfig<AnyRootTypes>;
  },
>(
  t: TInstance,
  opts: (object extends TInstance['_config']['$types']['ctx']
    ? {
        createContext?: () => MaybePromise<
          TInstance['_config']['$types']['ctx']
        >;
      }
    : {
        createContext: () => MaybePromise<
          TInstance['_config']['$types']['ctx']
        >;
      }) & {
    /**
     * Transform form data to a `Record` before passing it to the procedure
     * @default true
     */
    normalizeFormData?: boolean;
    onError?: (opts: {
      error: TRPCError;
      ctx: TInstance['_config']['$types']['ctx'] | undefined;
    }) => void;

    /**
     * When input validation fails, the error needs to be mapped to a shape that can be sent to the client
     */
    getValidationError: (opts: { error: TRPCInputValidationError }) => {
      fieldErrors: FieldErrors;
    };
  },
) {
  const config = t._config;
  const {
    //
    normalizeFormData = true,
    createContext,
  } = opts;

  const transformer = config.transformer;

  function actionHandler<TProc extends AnyMutationProcedure>(
    proc: TProc,
  ): ServerActionUseFormState<TProc> {
    return (async (...args: unknown[]) => {
      /**
       * When you wrap an action with useFormState, it gets an extra argument as its first argument.
       * The submitted form data is therefore its second argument instead of its first as it would usually be.
       * The new first argument that gets added is the current state of the form.
       * @see https://react.dev/reference/react-dom/hooks/useFormState#my-action-can-no-longer-read-the-submitted-form-data
       */
      let rawInput = args.length === 1 ? args[0] : args[1];

      let ctx: TInstance['_config']['$types']['ctx'] | undefined = undefined;
      try {
        ctx = createContext ? await createContext() : {};
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

        const data = await proc({
          input: undefined,
          ctx,
          path: 'serverAction',
          getRawInput: async () => rawInput,
          type: proc._def.type,
        });

        return {
          ok: true,
          data,
          input: rawInput,
        };
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);

        rethrowNextErrors(error);

        opts.onError?.({ error, ctx });
        if (error instanceof TypedTRPCError) {
          return {
            ok: false,
            error: error.data,
            input: rawInput,
          };
        }

        if (error instanceof TRPCInputValidationError) {
          return {
            ok: false,
            error: {
              ...opts.getValidationError({ error }),
              code: 'INPUT_VALIDATION',
            },
            input: rawInput,
          };
        }

        throw error;
      }
    }) as unknown as ServerActionUseFormState<TProc>;
  }
  return {
    action<TProc extends AnyMutationProcedure>(
      proc: TProc,
    ): ServerActionUseFormState<TProc> {
      return actionHandler(proc) as unknown as ServerActionUseFormState<TProc>;
    },
    /**
     * @deprecated this only exists for playing around - should be deleted
     */
    invokeAction<TProc extends AnyMutationProcedure>(
      proc: TProc,
    ): ServerActionInvoke<TProc> {
      return actionHandler(proc) as unknown as ServerActionInvoke<TProc>;
    },

    data<TProc extends AnyQueryProcedure>(proc: TProc): Query<TProc> {
      return async function actionHandler(rawInput) {
        let ctx: TInstance['_config']['$types']['ctx'] | undefined = undefined;
        try {
          ctx = createContext ? await createContext() : {};

          const output = await proc({
            input: undefined,
            ctx,
            path: 'serverAction',
            getRawInput: async () => rawInput,
            type: proc._def.type,
          });

          return {
            ok: true,
            output,
            input: rawInput,
          };
        } catch (cause) {
          const error = getTRPCErrorFromUnknown(cause);

          rethrowNextErrors(error);

          opts.onError?.({ error, ctx });
          if (error instanceof TypedTRPCError) {
            return {
              ok: false,
              error: error.data,
            };
          }
          if (error instanceof TRPCInputValidationError) {
            return {
              ok: false,
              error: {
                ...opts.getValidationError({ error }),
                code: 'INPUT_VALIDATION',
              },
            };
          }

          throw error;
        }
      };
    },
  };
}
