/** G-B: positional generics (v11 style, 8 slots). */
import type {
  ClientInput,
  inferIn,
  inferOut,
  MaybePromise,
  MergeInput,
  MiddlewareResult,
  Next,
  Overwrite,
  ResolverInput,
  Schema,
  Unset,
} from './shared.ts';
export interface Procedure<TType, TInput, TOutput, TErrors> {
  '~trpc': {
    type: TType;
    input: TInput;
    output: TOutput;
    errors: TErrors;
  };
}
type ResolverOutput<TOutputIn, $Output> = TOutputIn extends Unset
  ? $Output
  : TOutputIn;
export interface ProcedureBuilder<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
  TErrors,
> {
  input<$Schema extends Schema<any, any>>(
    schema: $Schema,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    MergeInput<TInputIn, inferIn<$Schema>>,
    MergeInput<TInputOut, inferOut<$Schema>>,
    TOutputIn,
    TOutputOut,
    TErrors
  >;
  output<$Schema extends Schema<any, any>>(
    schema: $Schema,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    inferIn<$Schema>,
    inferOut<$Schema>,
    TErrors
  >;
  meta(
    meta: TMeta,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TErrors
  >;
  use<$CtxOut extends object>(
    fn: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      meta: TMeta | undefined;
      next: Next;
    }) => MaybePromise<MiddlewareResult<$CtxOut>>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $CtxOut>,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TErrors
  >;
  query<$Output>(
    resolver: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: ResolverInput<TInputOut>;
    }) => MaybePromise<ResolverOutput<TOutputIn, $Output>>,
  ): Procedure<
    'query',
    ClientInput<TInputIn>,
    TOutputIn extends Unset ? $Output : TOutputOut,
    TErrors
  >;
  mutation<$Output>(
    resolver: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: ResolverInput<TInputOut>;
    }) => MaybePromise<ResolverOutput<TOutputIn, $Output>>,
  ): Procedure<
    'mutation',
    ClientInput<TInputIn>,
    TOutputIn extends Unset ? $Output : TOutputOut,
    TErrors
  >;
}
export declare function init<
  TOpts extends {
    ctx: object;
    meta: object;
  },
>(): {
  procedure: ProcedureBuilder<
    TOpts['ctx'],
    TOpts['meta'],
    object,
    Unset,
    Unset,
    Unset,
    Unset,
    never
  >;
};
type AnyProcedure = Procedure<any, any, any, any>;
export type DecorateRouter<T> = {
  [K in keyof T]: T[K] extends Procedure<infer TType, infer I, infer O, any>
    ? TType extends 'query'
      ? {
          query(input: I): Promise<Awaited<O>>;
        }
      : {
          mutate(input: I): Promise<Awaited<O>>;
        }
    : T[K] extends AnyProcedure
      ? never
      : DecorateRouter<T[K]>;
};
export declare function createClient<TRouter>(): DecorateRouter<TRouter>;
export {};
