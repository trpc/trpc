import { Observable } from 'rxjs';

export type inferObservableValue<TObservable extends Observable<any>> =
  TObservable extends Observable<infer TValue> ? TValue : never;
