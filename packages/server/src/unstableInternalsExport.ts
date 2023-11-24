/**
 * These types have to be exported so users can generate their own types definitions files
 *
 * Do not `import` anything here as it will be unreliable between minor versions of tRPC
 * If you need to import something here, open an issue at https://github.com/trpc/trpc/issues and we'll find a way to move it and make the API stable
 */
export { mergeRouters } from './core/internals/mergeRouters';
export * from './core/internals/procedureBuilder';
export * from './core/internals/utils';
export type { MiddlewareFunction, MiddlewareBuilder } from './core/middleware';
export * from './core/procedure';
export * from './types';
export * from './core';
export type { RootConfig, AnyRootConfig } from './core/internals/config';
export * from './transformer';
export { type DefaultErrorShape } from './error/formatter';
