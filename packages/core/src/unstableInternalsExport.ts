/**
 * These types have to be exported so users can generate their own types definitions files
 *
 * @remark Do not `import` anything here as it will be unreliable between minor versions of tRPC
 */
export { mergeRouters } from './internals/mergeRouters';
export * from './internals/procedureBuilder';
export * from './internals/utils';
export type { MiddlewareFunction, MiddlewareBuilder } from './middleware';
export * from './procedure';

export * from './types';
