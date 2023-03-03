/**
 * These types have to be exported so users can generate their own types definitions files
 */
export type { DefaultErrorShape } from './error/formatter';
export type { mergeRouters } from './core/internals/mergeRouters';
export type { RootConfig, AnyRootConfig } from './core/internals/config';
export type {
  ProcedureBuilder,
  BuildProcedure,
} from './core/internals/procedureBuilder';
export type { Overwrite, unsetMarker } from './core/internals/utils';
export type { MiddlewareFunction, MiddlewareBuilder } from './core/middleware';
