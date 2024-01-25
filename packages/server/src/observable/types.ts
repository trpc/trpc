export interface Unsubscribable {
  unsubscribe(): void;
}

export type UnsubscribeFn = () => void;

interface Subscribable<TValue, TError> {
  subscribe(observer: Partial<Observer<TValue, TError>>): Unsubscribable;
}

export interface Observable<TValue, TError>
  extends Subscribable<TValue, TError> {
  pipe(): Observable<TValue, TError>;
  pipe<TOperators extends OperatorFunction<any, any, any, any>[]>(
    ...operators: TOperators
  ): Observable<
    TOperators extends OperatorFunction<any, any, infer TOutValue, any>[]
      ? TOutValue
      : TValue,
    TOperators extends OperatorFunction<any, any, any, infer TOutError>[]
      ? TOutError
      : TError
  >;
}

export interface Observer<TValue, TError> {
  next: (value: TValue) => void;
  error: (err: TError) => void;
  complete: () => void;
}

export type TeardownLogic = Unsubscribable | UnsubscribeFn | void;

export type UnaryFunction<TSource, TReturn> = (source: TSource) => TReturn;

export type OperatorFunction<
  TValueBefore,
  TErrorBefore,
  TValueAfter,
  TErrorAfter,
> = UnaryFunction<
  Subscribable<TValueBefore, TErrorBefore>,
  Subscribable<TValueAfter, TErrorAfter>
>;

export type MonoTypeOperatorFunction<TValue, TError> = OperatorFunction<
  TValue,
  TError,
  TValue,
  TError
>;
