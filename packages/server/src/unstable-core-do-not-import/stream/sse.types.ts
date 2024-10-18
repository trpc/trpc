export interface EventSourceInitLike {
  withCredentials?: boolean;
}

// defined as `type` to be compatible with typescript's lib.dom.d.ts

export interface EventLike {
  data?: any;
  lastEventId?: string;
}

type EventSourceListenerLike = (event: EventLike) => void;

// readonly CLOSED: number;
// readonly CONNECTING: number;
// readonly OPEN: number;
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

export type ConstructorOf<T extends object = object> = new (
  ...args: any[]
) => T;

export type AnyEventSourceConstructorLike = EventSourceConstructorLike<any>;
export type ListenerOf<T extends AnyEventSourceConstructorLike> = Parameters<
  InstanceType<T>['addEventListener']
>[1];
export type EventOf<T extends AnyEventSourceConstructorLike> = Parameters<
  ListenerOf<T>
>[0];
export type EventSourceInitDictOf<T extends AnyEventSourceConstructorLike> =
  ConstructorParameters<T>[1];

// type Test = EventOf<EventSourceLike>

// const es = new EventSource('asd');
// es.addEventListener('message', (ev) => {
//   ev.data;
// });
// es.addEventListener('error', (ev) => {
//   ev.data;
// });
