/**
 * **DO NOT IMPORT FROM HERE FILE**
 *
 * This file is here to:
 * - make TypeScript happy and prevent _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
 * - the the glue between the official `@trpc/*`-packages
 *
 *
 * If you seem to need to import anything from here, please open an issue at https://github.com/trpc/trpc/issues
 */
export * from './clientish/inference';
export * from './clientish/inferrable';
export * from './clientish/serialize';
export * from './createProxy';
export * from './error/formatter';
export * from './error/getErrorShape';
export * from './error/TRPCError';
export * from './http';
export * from './initTRPC';
export * from './middleware';
export * from './parser';
export * from './procedure';
export * from './procedureBuilder';
export * from './rootConfig';
export * from './router';
export * from './router';
export * from './rpc';
export * from './transformer';
export * from './types';
export * from './utils';
