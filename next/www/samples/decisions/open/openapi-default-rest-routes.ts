/**
 * The API `.agent-docs/open/openapi-default-rest-routes.md` proposes, as
 * types: C's `filter` on `experimental_createOpenApiHandler`, the one
 * `experimental_generateOpenApi` already has. A is the handler as it is, and
 * B changes which procedures it serves, not its types.
 */
import type {
  OpenApiHandler,
  OpenApiHandlerOptions,
} from '@trpc12/trpc/openapi';
import type { AnyProcedure, AnyRouter } from '@trpc12/trpc/server';

/** C: the handler, with the generator's `filter`. */
export declare function experimental_createOpenApiHandlerC<
  TRouter extends AnyRouter,
>(
  opts: OpenApiHandlerOptions<TRouter> & {
    /** Leaves procedures out of the REST routes: they answer 404. */
    filter?: (opts: { path: string; procedure: AnyProcedure }) => boolean;
  },
): OpenApiHandler;
