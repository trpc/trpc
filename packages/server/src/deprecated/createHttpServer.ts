// this has been moved to separate package
import {
  CreateHTTPContextOptions,
  CreateHTTPHandlerOptions,
  createHTTPHandler,
  createHTTPServer,
} from '../adapters/standalone';
import { AnyRouter } from '../router';

/**
 * @deprecated use `createHTTPServer` from `@trpc/server/adapters/standalone`
 */
export const createHttpServer = createHTTPServer;

/**
 * @deprecated use `createHTTPHandler` from `@trpc/server/adapters/standalone`
 */
export const createHttpHandler = createHTTPHandler;

/**
 * @deprecated use `CreateHTTPHandlerOptions` from `@trpc/server/adapters/standalone`
 */
export type CreateHttpHandlerOptions<TRouter extends AnyRouter> =
  CreateHTTPHandlerOptions<TRouter>;

/**
 * @deprecated use `CreateHTTPContextOptions` from `@trpc/server/adapters/standalone`
 */
export type CreateHttpContextOptions = CreateHTTPContextOptions;
