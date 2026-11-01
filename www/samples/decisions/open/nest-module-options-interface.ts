/**
 * The options types `.agent-docs/open/nest-module-options-interface.md`
 * proposes for `TrpcModule.forRoot`: B makes `TrpcModuleOptions` one
 * interface with `layer` and `runtime` both optional; C puts everything but
 * those two in a `TrpcModuleBaseOptions` interface, with the exclusive
 * union over it. A is `TrpcModuleOptions` as it is, a type alias.
 */
import type { DynamicModule, ExecutionContext } from '@nestjs/common';
import type { BaseOpenApiHandlerOptions } from '@trpc12/trpc/openapi';
import type { CreateContextOpts } from '@trpc12/trpc/server';
import type { Layer, ManagedRuntime } from 'effect';

type HandlerOptions = Omit<
  BaseOpenApiHandlerOptions<never>,
  'router' | 'prefix' | 'contract'
>;

/** B: one interface; passing both `layer` and `runtime` throws at startup. */
export interface TrpcModuleOptionsB extends HandlerOptions {
  createContext?: (
    opts: CreateContextOpts<ExecutionContext>,
  ) => object | Promise<object>;
  layer?: Layer.Layer<any, any, never>;
  runtime?: ManagedRuntime.ManagedRuntime<any, any>;
}

export declare class TrpcModuleB {
  static forRoot(options?: TrpcModuleOptionsB): DynamicModule;
}

/** C: everything but `layer` and `runtime`, as an interface to augment. */
export interface TrpcModuleBaseOptionsC extends HandlerOptions {
  createContext?: (
    opts: CreateContextOpts<ExecutionContext>,
  ) => object | Promise<object>;
}

/** C: the base interface plus `layer` or `runtime`, not both. */
export type TrpcModuleOptionsC = TrpcModuleBaseOptionsC &
  (
    | { layer?: Layer.Layer<any, any, never>; runtime?: undefined }
    | { runtime: ManagedRuntime.ManagedRuntime<any, any>; layer?: undefined }
  );

export declare class TrpcModuleC {
  static forRoot(options?: TrpcModuleOptionsC): DynamicModule;
}
