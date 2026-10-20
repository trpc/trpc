import { Context } from 'effect';

/** The `platform` of the request being handled. @internal */
export const CurrentPlatform: Context.Reference<unknown> =
  /* @__PURE__ */ Context.Reference<unknown>('@trpc12/trpc/CurrentPlatform', {
    defaultValue: () => undefined,
  });
