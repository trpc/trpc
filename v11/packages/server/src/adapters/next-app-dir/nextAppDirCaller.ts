import type { CreateContextCallback } from '../../@trpc/server';
import { getTRPCErrorFromUnknown, TRPCError } from '../../@trpc/server';
// oxlint-disable-next-line no-restricted-imports
import { formDataToObject } from '../../unstable-core-do-not-import';
// FIXME: fix lint rule, this is ok
// oxlint-disable-next-line no-restricted-imports
import type { ErrorHandlerOptions } from '../../unstable-core-do-not-import/procedure';
// FIXME: fix lint rule, this is ok
// oxlint-disable-next-line no-restricted-imports
import type { CallerOverride } from '../../unstable-core-do-not-import/procedureBuilder';
// FIXME: fix lint rule, this is ok
// oxlint-disable-next-line no-restricted-imports
import type {
  MaybePromise,
  Simplify,
} from '../../unstable-core-do-not-import/types';
import { TRPCRedirectError } from './redirect';
import { rethrowNextErrors } from './rethrowNextErrors';

/**
 * Makes procedures callable as Next.js server actions and from React
 * Server Components. Pass it to `.experimental_caller()`.
 * @see https://trpc.io/docs/client/nextjs/server-actions#1-define-a-base-procedure-with-experimental_caller
 */
export function nextAppDirCaller<TContext, TMeta>(
  config: Simplify<
    {
      /**
       * Names the procedure from its metadata, for logs and errors, since
       * server actions have no router path.
       * @see https://trpc.io/docs/client/nextjs/server-actions#adding-observability-with-metadata
       */
      pathExtractor?: (opts: { meta: TMeta }) => string;
      /**
       * Turns `FormData` input into an object before validation.
       * @default true
       */
      normalizeFormData?: boolean;
      /**
       * Called when a procedure throws.
       */
      onError?: (opts: ErrorHandlerOptions<TContext>) => void;
    } & CreateContextCallback<TContext, () => MaybePromise<TContext>>
  >,
): CallerOverride<TContext> {
  const {
    normalizeFormData = true,

    // rethrowNextErrors = true
  } = config;
  const createContext = async (): Promise<TContext> => {
    return config?.createContext?.() ?? ({} as TContext);
  };

  return async (opts) => {
    const path =
      config.pathExtractor?.({ meta: opts._def.meta as TMeta }) ?? '';
    const ctx: TContext = await createContext().catch((cause) => {
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create context',
        cause,
      });

      throw error;
    });

    const handleError = (cause: unknown) => {
      const error = getTRPCErrorFromUnknown(cause);

      config.onError?.({
        ctx,
        error,
        input: opts.args[0],
        path,
        type: opts._def.type,
      });

      rethrowNextErrors(error);

      throw error;
    };
    switch (opts._def.type) {
      case 'mutation': {
        /**
         * When you wrap an action with useFormState, it gets an extra argument as its first argument.
         * The submitted form data is therefore its second argument instead of its first as it would usually be.
         * The new first argument that gets added is the current state of the form.
         * @see https://react.dev/reference/react-dom/hooks/useFormState#my-action-can-no-longer-read-the-submitted-form-data
         */
        let input = opts.args.length === 1 ? opts.args[0] : opts.args[1];
        if (normalizeFormData && input instanceof FormData) {
          input = formDataToObject(input);
        }

        return await opts
          .invoke({
            type: opts._def.type,
            ctx,
            getRawInput: async () => input,
            path,
            input,
            signal: undefined,
            batchIndex: 0,
          })
          .then((data) => {
            if (data instanceof TRPCRedirectError) throw data;
            return data;
          })
          .catch(handleError);
      }
      case 'query': {
        const input = opts.args[0];
        return await opts
          .invoke({
            type: opts._def.type,
            ctx,
            getRawInput: async () => input,
            path,
            input,
            signal: undefined,
            batchIndex: 0,
          })
          .then((data) => {
            if (data instanceof TRPCRedirectError) throw data;
            return data;
          })
          .catch(handleError);
      }
      case 'subscription':
      default: {
        throw new TRPCError({
          code: 'NOT_IMPLEMENTED',
          message: `Not implemented for type ${opts._def.type}`,
        });
      }
    }
  };
}
