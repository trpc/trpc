/**
 * The API `.agent-docs/open/v11-interop-refuse-promises.md` proposes, as
 * types: C's `deferred` option on `createV11Handler`. A settles promises as
 * the handler does today; B refuses them with no new option.
 */
import type { V11Handler, V11HandlerOptions } from '@trpc12/trpc/interop';
import type { AnyRouter } from '@trpc12/trpc/server';

/** C: `createV11Handler` with `deferred`. */
export declare function createV11HandlerC<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: V11HandlerOptions<TRouter, TPlatform> & {
    /**
     * Promises in an output on `httpLink` and `httpBatchLink`: `'settle'`
     * sends the settled value, `'refuse'` answers with v11's 415.
     * @default 'settle'
     */
    deferred?: 'settle' | 'refuse';
  },
): V11Handler<TPlatform>;
