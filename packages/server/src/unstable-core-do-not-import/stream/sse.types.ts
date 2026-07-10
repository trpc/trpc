/* eslint-disable @typescript-eslint/no-namespace */

/**
 * @internal
 */
export namespace EventSourceLike {
  export interface InitDict {
    withCredentials?: boolean;
  }

  export interface MessageEvent extends Event {
    data: any;
    lastEventId?: string;
  }
  export interface Event {}

  type EventSourceListenerLike = (event: Event) => void;

  export type AnyConstructorLike<TInit extends InitDict> = new (
    url: string,
    eventSourceInitDict?: TInit,
  ) => Instance;

  export interface Instance {
    readonly CLOSED: number;
    readonly CONNECTING: number;
    readonly OPEN: number;

    addEventListener(type: string, listener: EventSourceListenerLike): void;
    removeEventListener(type: string, listener: EventSourceListenerLike): void;
    close: () => void;

    readyState: number;
  }

  export type AnyConstructor = AnyConstructorLike<any>;

  export type ListenerOf<T extends AnyConstructor> = Parameters<
    InstanceType<T>['addEventListener']
  >[1];
  export type EventOf<T extends AnyConstructor> = Parameters<ListenerOf<T>>[0];
  export type InitDictOf<T extends AnyConstructor> =
    ConstructorParameters<T>[1];
}
