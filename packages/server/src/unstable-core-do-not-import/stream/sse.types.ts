/* eslint-disable @typescript-eslint/no-namespace */

/**
 * @internal
 */
export namespace EventSourcePonyfill {
  export interface EventSourceInitLike {
    withCredentials?: boolean;
  }

  export type EventLike = {
    data?: any;
    lastEventId?: string;
  };

  type EventSourceListenerLike = (event: EventLike) => void;

  export type EventSourceConstructorLike<TInit extends EventSourceInitLike> =
    new (url: string, eventSourceInitDict?: TInit) => EventSourceLike;

  export interface EventSourceLike {
    readonly CLOSED: number;
    readonly CONNECTING: number;
    readonly OPEN: number;

    addEventListener(type: string, listener: EventSourceListenerLike): void;
    removeEventListener(type: string, listener: EventSourceListenerLike): void;
    close: () => void;

    readyState: number;
  }

  export type AnyEventSourceConstructorLike = EventSourceConstructorLike<any>;
  export type ListenerOf<T extends AnyEventSourceConstructorLike> = Parameters<
    InstanceType<T>['addEventListener']
  >[1];
  export type EventOf<T extends AnyEventSourceConstructorLike> = Parameters<
    ListenerOf<T>
  >[0];
  export type EventSourceInitDictOf<T extends AnyEventSourceConstructorLike> =
    ConstructorParameters<T>[1];
}
