import type { UnsetMarker } from "./internals/utils";
import type { inferObservableValue } from '../observable';
import type { inferTransformedProcedureOutput } from '../shared/jsonify';
import type { AnyRootConfig } from "./internals/config";
import type { AnyProcedure, Procedure, ProcedureArgs, ProcedureInputOutput } from './procedure';
import type { AnyRouter, AnyRouterDef, Router } from './router';

export type inferRouterDef<TRouter extends AnyRouter> = TRouter extends Router<
  infer TParams
>
  ? TParams extends AnyRouterDef<any>
    ? TParams
    : never
  : never;

export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config']['$types']['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config']['$types']['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config']['$types']['meta'];

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;

/**
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

export type ExtractInputOutputEntry<TInputOutputs extends readonly ProcedureInputOutput[], TInput> =
  TInputOutputs extends readonly ProcedureInputOutput[] ?
    TInputOutputs[number] extends infer TIOEntry ?
      TIOEntry extends ProcedureInputOutput ?
        UnsetMarker extends TIOEntry['inputIn'] ?
          TInput extends undefined | void ?
            TIOEntry :
          never :
        TInput extends TIOEntry['inputIn'] ?
          TIOEntry :
        never :
      never :
    never :
  never
;

//    v?
type TestIOExtract = ExtractInputOutputEntry<[
  {
    inputIn: 'a';
    inputOut: 'a';
    outputIn: number[];
    outputOut: number[];
  },
  {
    inputIn: UnsetMarker;
    inputOut: UnsetMarker;
    outputIn: 'meh';
    outputOut: 'meh';
  },
  {
    inputIn: 'b';
    inputOut: 'b';
    outputIn: number[];
    outputOut: number[];
  }
], undefined>;

export type ExtractProcedureInputFromHandlerInput<THandlerInput> =
  THandlerInput extends readonly [infer Input, unknown?] ?
    Input :
  THandlerInput extends readonly [] ?
    undefined | void :
  never
;

export type inferHandlerInput<TProcedure extends AnyProcedure> = ProcedureArgs<
  inferProcedureParams<TProcedure>
>;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  inferHandlerInput<TProcedure>[0];

type TProc = Procedure<'query', {
  _config: AnyRootConfig,
  _ctx_out: unknown,
  _meta: unknown,
  _inputOutputs: [{
    inputIn: 'a';
    inputOut: 'a';
    outputIn: number[];
    outputOut: number[];
  },
  {
    inputIn: UnsetMarker;
    inputOut: UnsetMarker;
    outputIn: number[];
    outputOut: number[];
  },
  {
    inputIn: 'b';
    inputOut: 'b';
    outputIn: string[];
    outputOut: string[];
  }]
}>;

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;

export type inferProcedureOutput<TProcedure, TInput = any> =
  inferProcedureParams<TProcedure>['_inputOutputs'] extends infer IO extends readonly ProcedureInputOutput[] ?
    ExtractInputOutputEntry<IO, TInput> extends infer IOEntry extends ProcedureInputOutput ?
      [IOEntry] extends [never] ?
        never :
      IOEntry['outputOut'] :
    never :
  never
;

/**
 * @deprecated will be removed in next major as it's v9 stuff
 */
export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends string & keyof TRouter['_def']['subscriptions'],
  TInput
> = inferObservableValue<
  inferProcedureOutput<TRouter['_def']['subscriptions'][TPath], TInput>
>;

export type inferProcedureClientError<TProcedure extends AnyProcedure> =
  inferProcedureParams<TProcedure>['_config']['errorShape'];

type GetInferenceHelpers<
  TType extends 'input' | 'output',
  TRouter extends AnyRouter,
  TInput
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? GetInferenceHelpers<TType, TRouterOrProcedure, TInput>
      : TRouterOrProcedure extends AnyProcedure
      ? TType extends 'input'
        ? inferProcedureInput<TRouterOrProcedure>
        : inferTransformedProcedureOutput<TRouterOrProcedure, TInput>
      : never
    : never;
};

export type inferRouterInputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'input',
  TRouter,
  any
>;

export type inferRouterOutputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'output',
  TRouter,
  any
>;
