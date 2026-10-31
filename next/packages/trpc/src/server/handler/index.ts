/**
 * Handlers: the fetch handler and its HTTP routes and bodies, the
 * transport-agnostic handler core, and the registry of each handler's services.
 *
 * @module
 */
export {
  drainingBodyStream,
  readBytes,
  responseOptions,
  type BodyError,
} from './body.ts';
export { strictestCacheControl } from './cache-control.ts';
export { createHandlerCore } from './core.ts';
export type { HandlerCore } from './core.ts';
export { HttpApp, parentSpan } from './app.ts';
export { fromWebResponse, textWebResponse } from './responses.ts';
export { createFetchHandler, makeFetchHandler } from './fetch.ts';
export type {
  BaseHandlerOptions,
  ContextOption,
  CreateContextOpts,
  FetchHandler,
  FetchHandlerOptions,
  LayerOption,
  MakeFetchHandlerOptions,
  OnErrorOpts,
  PlatformArgs,
  PlatformField,
  RuntimeOption,
  TransformerOption,
} from './fetch.ts';
export { handlerContext, setHandlerContext } from './handler-context.ts';
export { CurrentPlatform } from './platform.ts';
export { withMiddleware } from './routes.ts';
