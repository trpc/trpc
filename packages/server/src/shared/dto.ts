/* eslint-disable @typescript-eslint/naming-convention */

/**
 * @link https://raw.githubusercontent.com/tamj0rd2/dto/master/src/dto.ts
 */
import { AnyProcedure, AnyRouter } from '../core';
import { DefaultDataTransformer } from '../transformer';

type IsOptional<T> = Extract<T, undefined> extends never ? false : true;
type Func = (...args: any[]) => any;
type IsFunction<T> = T extends Func ? true : false;
type IsValueType<T> = T extends
  | string
  | number
  | boolean
  | null
  | undefined
  | Func
  | Set<any>
  | Map<any, any>
  | Date
  | Array<any>
  ? true
  : false;

type ReplaceDate<T> = T extends Date ? string : T;

const errorSymbol = Symbol('ERROR');

type ErrorBranded<T, TMessage extends string> = T & { [errorSymbol]: TMessage };

type ReplaceSet<T> = T extends Set<any>
  ? ErrorBranded<{}, 'Set is not JSON serializable`'>
  : T;

type ReplaceMap<T> = T extends Map<any, any>
  ? ErrorBranded<{}, 'Map is not JSON serializable'>
  : T;
type ReplaceArray<T> = T extends Array<infer X> ? Dto<X>[] : T;

type ExcludeFuncsFromObj<T> = Pick<
  T,
  { [K in keyof T]: IsFunction<T[K]> extends true ? never : K }[keyof T]
>;

type Dtoified<T> = IsValueType<T> extends true
  ? ReplaceDate<ReplaceMap<ReplaceSet<ReplaceArray<T>>>>
  : { [K in keyof ExcludeFuncsFromObj<T>]: Dto<T[K]> };

export type Dto<T> = IsFunction<T> extends true
  ? never
  : IsOptional<T> extends true
  ? Dtoified<Exclude<T, undefined>> | null
  : Dtoified<T>;

// export type Serializable<T> = T & { serialize(): Dto<T> };

export type RouterDto<
  TRouter extends AnyRouter,
  TData,
> = TRouter['_def']['_config']['transformer'] extends DefaultDataTransformer
  ? Dto<TData>
  : TData;

export type ProcedureDto<TProcedure extends AnyProcedure> =
  TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? Dto<TProcedure['_def']['_output_out']>
    : TProcedure['_def']['_output_out'];
