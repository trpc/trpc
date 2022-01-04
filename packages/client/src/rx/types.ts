export interface Unsubscribable {
  unsubscribe(): void;
}
export interface Subscribable<TValue, TError> {
  subscribe(observer: Partial<Observer<TValue, TError>>): Unsubscribable;
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
  | SubscriptionLike
  | Unsubscribable
  | (() => void)
  | void;
