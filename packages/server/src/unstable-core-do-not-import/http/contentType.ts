import type { TRPCError } from '../error/TRPCError';
import type { AnyRouter } from '../router';

export type BodyResult =
  | {
      ok: true;
      data: unknown;
      /**
       * If the HTTP handler has already parsed the body
       */
      preprocessed: boolean;
    }
  | { ok: false; error: TRPCError };

export type BaseContentTypeHandler<TOptions> = {
  isMatch(opts: TOptions): boolean;
  getInputs: (
    opts: TOptions,
    info: {
      isBatchCall: boolean;
      /**
       * @deprecated not sure if this is used or needed?
       */
      router: AnyRouter;
    },
  ) => Promise<unknown>;
};
