import { z } from 'zod';
import type { CallerOverride } from '../unstable-core-do-not-import/procedureBuilder';

export function createNextAppDirCaller(config: {
  // createContext: () => MaybePromise<TInstance['_config']['$types']['ctx']>;
  /**
   * Transform form data to a `Record` before passing it to the procedure
   * @default true
   */
  // normalizeFormData?: boolean;
}): CallerOverride {
  return async (opts) => {
    switch (opts._def.type) {
      case 'mutation': {
        /**
         * When you wrap an action with useFormState, it gets an extra argument as its first argument.
         * The submitted form data is therefore its second argument instead of its first as it would usually be.
         * The new first argument that gets added is the current state of the form.
         * @see https://react.dev/reference/react-dom/hooks/useFormState#my-action-can-no-longer-read-the-submitted-form-data
         */
        const input = opts.args.length === 1 ? opts.args[0] : opts.args[1];

        return opts.invoke({
          type: 'query',
          ctx: {},
          getRawInput: async () => input,
          path: '',
          input,
        });
      }
      case 'query': {
        const input = opts.args[0];
        return opts.invoke({
          type: 'query',
          ctx: {},
          getRawInput: async () => input,
          path: '',
          input,
        });
      }
      default: {
        throw new TRPCError({
          code: 'NOT_IMPLEMENTED',
          message: `Not implemented for type ${opts._def.type}`,
        });
      }
    }
  };
}
