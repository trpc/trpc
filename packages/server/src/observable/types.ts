export interface Unsubscribable {
  unsubscribe(): void;
}
export type UnsubscribeFn = () => void;
export interface Subscribable<TValue, TError> {
  subscribe(observer: Partial<Observer<TValue, TError>>): Unsubscribable;
}
export interface Observable<TValue, TError>
  extends Subscribable<TValue, TError> {
  pipe(): Observable<TValue, TError>;
  pipe<V1, E1>(
    op1: OperatorFunction<TValue, TError, V1, E1>,
  ): Observable<V1, E1>;
  pipe<V1, E1, V2, E2>(
    op1: OperatorFunction<TValue, TError, V1, E1>,
    op2: OperatorFunction<V1, E1, V2, E2>,
  ): Observable<V2, E2>;
  pipe<V1, E1, V2, E2, V3, E3>(
    op1: OperatorFunction<TValue, TError, V1, E1>,
    op2: OperatorFunction<V1, E1, V2, E2>,
    op3: OperatorFunction<V2, E2, V3, E3>,
  ): Observable<V2, E2>;
  pipe<V1, E1, V2, E2, V3, E3, V4, E4>(
    op1: OperatorFunction<TValue, TError, V1, E1>,
    op2: OperatorFunction<V1, E1, V2, E2>,
    op3: OperatorFunction<V2, E2, V3, E3>,
    op4: OperatorFunction<V3, E3, V4, E4>,
  ): Observable<V2, E2>;
  pipe<V1, E1, V2, E2, V3, E3, V4, E4, V5, E5>(
    op1: OperatorFunction<TValue, TError, V1, E1>,
    op2: OperatorFunction<V1, E1, V2, E2>,
    op3: OperatorFunction<V2, E2, V3, E3>,
    op4: OperatorFunction<V3, E3, V4, E4>,
    op5: OperatorFunction<V4, E4, V5, E5>,
  ): Observable<V2, E2>;
}
export interface SubscriptionLike extends Unsubscribable {
  unsubscribe(): void;
  readonly closed: boolean;
}

export interface Observer<TValue, TError> {
  next: (value: TValue) => void;
  error: (err: TError) => void;
  complete: () => void;
}

export type TeardownLogic =
  // | SubscriptionLike
  Unsubscribable | UnsubscribeFn | void;

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
