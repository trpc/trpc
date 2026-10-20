/**
 * The APIs `.agent-docs/open/scoped-openapi-and-v11-handlers.md` proposes,
 * as types: B adds `experimental_makeOpenApiHandler` and `makeV11Handler`,
 * which read their services from the Effect's context and dispose the
 * handler when its scope ends, as `makeFetchHandler` does. A is the
 * `create` forms as they are.
 */
import type { BaseV11HandlerOptions, V11Handler } from '@trpc12/trpc/interop';
import type {
  BaseOpenApiHandlerOptions,
  OpenApiHandler,
} from '@trpc12/trpc/openapi';
import type {
  AnyRouter,
  ContextOption,
  inferRouterContext,
  inferRouterServices,
} from '@trpc12/trpc/server';
import type { Effect, Scope } from 'effect';

/** B: the OpenAPI handler's options without `layer` or `runtime`. */
export type MakeOpenApiHandlerOptionsB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseOpenApiHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform>;

export declare function experimental_makeOpenApiHandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: MakeOpenApiHandlerOptionsB<TRouter, TPlatform>,
): Effect.Effect<
  OpenApiHandler<TPlatform>,
  never,
  Scope.Scope | inferRouterServices<TRouter>
>;

/** B: the v11 handler's options without `layer` or `runtime`. */
export type MakeV11HandlerOptionsB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseV11HandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform>;

export declare function makeV11HandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: MakeV11HandlerOptionsB<TRouter, TPlatform>,
): Effect.Effect<
  V11Handler<TPlatform>,
  never,
  Scope.Scope | inferRouterServices<TRouter>
>;
