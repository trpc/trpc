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
  pipe<TValue1, TError1>(
    op1: OperatorFunction<TValue, TError, TValue1, TError1>,
  ): Observable<TValue1, TError1>;
  pipe<TValue1, TError1, TValue2, TError2>(
    op1: OperatorFunction<TValue, TError, TValue1, TError1>,
    op2: OperatorFunction<TValue1, TError1, TValue2, TError2>,
  ): Observable<TValue2, TError2>;
  pipe<TValue1, TError1, TValue2, TError2, TValue3, TError3>(
    op1: OperatorFunction<TValue, TError, TValue1, TError1>,
    op2: OperatorFunction<TValue1, TError1, TValue2, TError2>,
    op3: OperatorFunction<TValue2, TError2, TValue3, TError3>,
  ): Observable<TValue2, TError2>;
  pipe<TValue1, TError1, TValue2, TError2, TValue3, TError3, TValue4, TError4>(
    op1: OperatorFunction<TValue, TError, TValue1, TError1>,
    op2: OperatorFunction<TValue1, TError1, TValue2, TError2>,
    op3: OperatorFunction<TValue2, TError2, TValue3, TError3>,
    op4: OperatorFunction<TValue3, TError3, TValue4, TError4>,
  ): Observable<TValue2, TError2>;
  pipe<
    TValue1,
    TError1,
    TValue2,
    TError2,
    TValue3,
    TError3,
    TValue4,
    TError4,
    TValue5,
    TError5,
  >(
    op1: OperatorFunction<TValue, TError, TValue1, TError1>,
    op2: OperatorFunction<TValue1, TError1, TValue2, TError2>,
    op3: OperatorFunction<TValue2, TError2, TValue3, TError3>,
    op4: OperatorFunction<TValue3, TError3, TValue4, TError4>,
    op5: OperatorFunction<TValue4, TError4, TValue5, TError5>,
  ): Observable<TValue2, TError2>;
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
