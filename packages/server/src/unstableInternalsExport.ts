/**
 * These types have to be exported so users can generate their own types definitions files
 *
 * @remark Do not `import` anything here as it will be unreliable between minor versions of tRPC
 */
export { mergeRouters } from './core/internals/mergeRouters';
export * from './core/internals/procedureBuilder';
export * from './core/internals/utils';
export type { MiddlewareFunction, MiddlewareBuilder } from './core/middleware';
export * from './core/procedure';

export * from './types';
