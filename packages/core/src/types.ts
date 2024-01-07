import { AnyProcedure, ProcedureArgs } from './procedure';
import { AnyRouter, AnyRouterDef, Router } from './router';
import { inferTransformedProcedureOutput } from './shared/jsonify';

export type inferRouterDef<TRouter extends AnyRouter> = TRouter extends Router<
  infer TParams
>
  ? TParams extends AnyRouterDef<any>
    ? TParams
    : never
  : never;

export type inferRouterConfig<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config'];
export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['meta'];

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

export type inferHandlerInput<TProcedure extends AnyProcedure> = ProcedureArgs<
  inferProcedureParams<TProcedure>
>;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  inferProcedureParams<TProcedure>['_input_in'];

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['_output_out'];

type GetInferenceHelpers<
  TType extends 'input' | 'output',
  TRouter extends AnyRouter,
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? GetInferenceHelpers<TType, TRouterOrProcedure>
      : TRouterOrProcedure extends AnyProcedure
      ? TType extends 'input'
        ? inferProcedureInput<TRouterOrProcedure>
        : inferTransformedProcedureOutput<
            TRouter['_def']['_config'],
            TRouterOrProcedure
          >
      : never
    : never;
};

export type inferRouterInputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'input',
  TRouter
>;

export type inferRouterOutputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'output',
  TRouter
>;

/**
 * @internal
 */
export type IntersectionError<TKey extends string> =
  `The property '${TKey}' in your router collides with a built-in method, rename this router or procedure on your backend.`;

/**
 * @internal
 */
export type ProtectedIntersection<TType, TWith> = keyof TType &
  keyof TWith extends never
  ? TType & TWith
  : IntersectionError<string & keyof TType & keyof TWith>;

/**
 * @public
 */
export type Maybe<TType> = TType | null | undefined;

/**
 * @internal
 * @see https://github.com/ianstormtaylor/superstruct/blob/7973400cd04d8ad92bbdc2b6f35acbfb3c934079/src/utils.ts#L323-L325
 */
export type Simplify<TType> = TType extends any[] | Date
  ? TType
  : { [K in keyof TType]: TType[K] };
/**
 * @public
 */
export type Dict<TType> = Record<string, TType | undefined>;

/**
 * @public
 */
export type MaybePromise<TType> = Promise<TType> | TType;

/**
 * @internal
 *
 * Creates a "lower-priority" type inference.
 * https://github.com/microsoft/TypeScript/issues/14829#issuecomment-322267089
 */
export type InferLast<TType> = TType & {
  [KeyType in keyof TType]: TType[KeyType];
};

/**
 * @public
 */
export type inferAsyncReturnType<TFunction extends (...args: any) => any> =
  Awaited<ReturnType<TFunction>>;

export type FilterKeys<TObj extends object, TFilter> = {
  [TKey in keyof TObj]: TObj[TKey] extends TFilter ? TKey : never;
}[keyof TObj];

/**
 * @internal
 */
export type Filter<TObj extends object, TFilter> = Pick<
  TObj,
  FilterKeys<TObj, TFilter>
>;

/**
 * Unwrap return type if the type is a function (sync or async), else use the type as is
 * @internal
 */
export type Unwrap<TType> = TType extends (...args: any[]) => infer R
  ? Awaited<R>
  : TType;

/**
 * Makes the object recursively optional
 * @internal
 */
export type DeepPartial<TObject> = TObject extends object
  ? {
      [P in keyof TObject]?: DeepPartial<TObject[P]>;
    }
  : TObject;

/**
 * Omits the key without removing a potential union
 * @internal
 */
export type DistributiveOmit<TObj, TKey extends keyof any> = TObj extends any
  ? Omit<TObj, TKey>
  : never;

/*
 * See https://github.com/microsoft/TypeScript/issues/41966#issuecomment-758187996
 * Fixes issues with iterating over keys of objects with index signatures.
 * Without this, iterations over keys of objects with index signatures will lose
 * type information about the keys and only the index signature will remain.
 * @internal
 */
export type WithoutIndexSignature<TObj> = {
  [K in keyof TObj as string extends K
    ? never
    : number extends K
    ? never
    : K]: TObj[K];
};
