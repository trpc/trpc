/** What `subscribe()` returns: call `unsubscribe()` to stop. */
export interface Unsubscribable {
  /** Stops the subscription and runs its teardown. */
  unsubscribe(): void;
}
/** Stops a subscription. */
export type UnsubscribeFn = () => void;
interface Subscribable<TValue, TError> {
  /** Starts the observable, sending what it emits to `observer`. */
  subscribe(observer: Partial<Observer<TValue, TError>>): Unsubscribable;
}
/**
 * A stream of values, which starts when you subscribe to it. Links pass
 * results along as observables.
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 */
export interface Observable<TValue, TError> extends Subscribable<
  TValue,
  TError
> {
  /** Returns an observable with the operators applied, in order. */
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

/** Gets an observable's values, its error, and its end. */
export interface Observer<TValue, TError> {
  /** Gets each value. */
  next: (value: TValue) => void;
  /** Gets the error the observable ends with. */
  error: (err: TError) => void;
  /** Called when the observable ends without an error. */
  complete: () => void;
}

/** What the function passed to `observable()` returns to clean up on unsubscribe. */
export type TeardownLogic =
  // | SubscriptionLike
  Unsubscribable | UnsubscribeFn | void;

/** A function of one argument. */
export type UnaryFunction<TSource, TReturn> = (source: TSource) => TReturn;

/** Turns one observable into another, for `pipe()`. */
export type OperatorFunction<
  TValueBefore,
  TErrorBefore,
  TValueAfter,
  TErrorAfter,
> = UnaryFunction<
  Subscribable<TValueBefore, TErrorBefore>,
  Subscribable<TValueAfter, TErrorAfter>
>;

/** An operator that keeps the value and error types. */
export type MonoTypeOperatorFunction<TValue, TError> = OperatorFunction<
  TValue,
  TError,
  TValue,
  TError
>;
