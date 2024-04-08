import type { TRPCError } from '../error/TRPCError';

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
      batch: number;
    },
  ) => Promise<unknown>;
};
