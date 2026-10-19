/**
 * Handlers: the fetch handler and its HTTP routes and bodies, the
 * transport-agnostic handler core, and the registry of each handler's services.
 *
 * @module
 */
export { readBytes, responseOptions } from './body.ts';
export { strictestCacheControl } from './cache-control.ts';
export { createHandlerCore } from './core.ts';
export type { HandlerCore } from './core.ts';
export {
  CurrentPlatform,
  HttpApp,
  createFetchHandler,
  parentSpan,
} from './fetch.ts';
export type {
  BaseHandlerOptions,
  ContextOption,
  CreateContextOpts,
  FetchHandler,
  FetchHandlerOptions,
  LayerOption,
  OnErrorOpts,
  PlatformArgs,
  PlatformField,
  SerializerOption,
} from './fetch.ts';
export { handlerContext, setHandlerContext } from './handler-context.ts';
export { withMiddleware } from './routes.ts';
