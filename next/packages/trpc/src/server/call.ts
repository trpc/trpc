import { Cause, Effect, Exit, type Layer, type ManagedRuntime } from 'effect';
import { interruptSignal } from '../internal/effects.ts';
import { abortedError, frameworkError } from '../internal/error.ts';
import type { ProcedureResponse } from '../internal/types.ts';
import {
  callProcedure,
  createResponseHandle,
  inProcessOutput,
  normalizeCause,
  runtimeServices,
} from './execution/index.ts';
import type {
  AnyProcedure,
  DefCtx,
  DefServices,
  ProcedureDef,
  ProcedureDefOf,
} from './procedures/index.ts';

type Runtime<TServices> = ManagedRuntime.ManagedRuntime<TServices, unknown>;

/** A `layer` built for the call, or a caller-owned `runtime`. @internal */
export type CallServicesOption<TServices> = [TServices] extends [never]
  ? {
      layer?: Layer.Layer<never, any, never>;
      runtime?: Runtime<never> | undefined;
    }
  :
      | { layer: Layer.Layer<TServices, any, never>; runtime?: undefined }
      | { runtime: Runtime<TServices>; layer?: undefined };

/**
 * The options of `t.call()`. `ctx` is the root's ctx and the keys the
 * procedure's standalone middleware need; it is required unless that's
 * `{}`, and `layer` or `runtime` when the procedure needs Effect services.
 * @since 0.1.0
 * @stability stable
 */
export type CallOptions<TCtx, TDef extends ProcedureDef> = ({} extends TCtx &
  DefCtx<TDef>
  ? { ctx?: TCtx & DefCtx<TDef> }
  : { ctx: TCtx & DefCtx<TDef> }) & {
  signal?: AbortSignal;
  /** Passed to middleware and the resolver. @default '' */
  path?: string;
} & CallServicesOption<DefServices<TDef>>;

/**
 * A returned `HttpServerResponse` reaches `t.call()`'s caller as a web `Response`.
 * @since 0.1.0
 * @stability stable
 */
export type CallOutput<T> = [Extract<T, ProcedureResponse>] extends [never]
  ? T
  : Exclude<T, ProcedureResponse> | globalThis.Response;

/**
 * `t.call()`: the root types `ctx`, which a procedure's type leaves out.
 * @since 0.1.0
 * @stability stable
 */
export type Call<TCtx> = <P extends AnyProcedure>(
  procedure: P,
  input: ProcedureDefOf<P>['input'],
  ...[opts]: {} extends CallOptions<TCtx, ProcedureDefOf<P>>
    ? [opts?: CallOptions<TCtx, ProcedureDefOf<P>>]
    : [opts: CallOptions<TCtx, ProcedureDefOf<P>>]
) => Promise<CallOutput<ProcedureDefOf<P>['output']>>;

/** @internal */
export async function call(
  procedure: AnyProcedure,
  input: unknown,
  opts?: {
    ctx?: object;
    signal?: AbortSignal;
    path?: string;
    layer?: Layer.Layer<never, any, never>;
    runtime?: Runtime<never> | undefined;
  },
): Promise<unknown> {
  const o = opts ?? {};
  const response = createResponseHandle();
  const run = (signal: AbortSignal) =>
    Effect.flatMap(
      callProcedure({
        procedure,
        path: o.path ?? '',
        ctx: o.ctx ?? {},
        input,
        signal,
        response,
        allowResponse: true,
      }),
      (value) => inProcessOutput(value, response),
    );
  const effect = o.signal
    ? run(o.signal)
    : Effect.flatMap(interruptSignal(), (interrupt) =>
        interrupt.abortOnInterrupt(run(interrupt.signal)),
      );
  const provided = o.runtime
    ? Effect.flatMap(runtimeServices(o.runtime), (services) =>
        Effect.provideContext(effect, services),
      )
    : o.layer
      ? Effect.provide(effect, o.layer)
      : effect;
  const exit = await Effect.runPromiseExit(
    provided as Effect.Effect<unknown, never, never>,
    { signal: o.signal },
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.hasInterruptsOnly(exit.cause)
    ? abortedError(o.signal?.reason)
    : normalizeCause(exit.cause);
  throw frameworkError(error) ?? error;
}
