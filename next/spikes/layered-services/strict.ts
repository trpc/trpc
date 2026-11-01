/**
 * Prototype of strict procedures (proposal 27 P3), as a function on the
 * shipped builder: `strict(t.procedure.output(Post).errors({ NOT_FOUND: {} }))`.
 * A strict procedure is checked the way `effect/rpc` checks a handler against
 * its `Rpc`, and the way `t.implement()` checks one against a contract:
 *
 * - the output must be declared with `.output()`, and the resolver returns it;
 * - the resolver may only fail with the errors declared with `.errors()` or
 *   added by its middleware (the contract's `UndeclaredCheck`);
 * - Effect failures that aren't a `TrpcError` stay a compile error (Q2.3).
 *
 * Services stay inferred, as in `effect/rpc`. A builder flag would put the
 * same checks on `query`/`mutation`; the function only keeps the terminals.
 */
import type { Effect } from 'effect';
import type {
  BuilderDef,
  SplitReturn,
  StrictErrors,
  TypeError,
  UndeclaredCheck,
  Unset,
} from '@trpc12/trpc/internal';
import type {
  AnyTrpcError,
  Procedure,
  ProcedureBuilder,
  ResolverOpts,
} from '@trpc12/trpc/server';

type Value<T> = T extends Unset ? undefined : T;

/** A strict procedure declares its output. */
export type DeclaresOutput<TDef extends BuilderDef> =
  TDef['outputIn'] extends Unset
    ? TypeError<'strict: declare the output with .output()'>
    : unknown;

type Result<TDef extends BuilderDef> =
  | TDef['outputIn']
  | AnyTrpcError
  | Promise<TDef['outputIn'] | AnyTrpcError>
  | Effect.Effect<TDef['outputIn'] | AnyTrpcError, any, any>;

type Resolve<TDef extends BuilderDef, TType extends 'query' | 'mutation'> = <
  $Ret,
>(
  resolver: (
    opts: ResolverOpts<TDef>,
  ) => $Ret &
    Result<TDef> &
    StrictErrors<$Ret> &
    UndeclaredCheck<TDef, SplitReturn<$Ret>['errors']>,
) => Procedure<
  {
    ctx: TDef['ctx'];
    input: Value<TDef['inputIn']>;
    output: TDef['outputOut'];
    errors: TDef['errors'];
    services:
      | TDef['requires']
      | Exclude<SplitReturn<$Ret>['services'], TDef['provided']>;
  },
  TType
>;

/** The terminals of a strict procedure. */
export interface StrictBuilder<TDef extends BuilderDef> {
  readonly query: Resolve<TDef, 'query'>;
  readonly mutation: Resolve<TDef, 'mutation'>;
}

/** Checks the procedure's resolver against its declared output and errors. */
export function strict<TDef extends BuilderDef>(
  builder: Pick<ProcedureBuilder<TDef>, '~trpc'> & DeclaresOutput<TDef>,
): StrictBuilder<TDef> {
  return builder as never;
}
