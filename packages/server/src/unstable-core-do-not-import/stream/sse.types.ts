export interface EventSourceInitLike {
  withCredentials?: boolean;
}

// defined as `type` to be compatible with typescript's lib.dom.d.ts

export interface EventLike {
  data?: any;
  lastEventId?: string;
}

type EventSourceListenerLike = (event: EventLike) => void;

export interface EventSourceConstructorLike<TInit extends EventSourceInitLike> {
  prototype: any;
  new (url: string, eventSourceInitDict?: TInit): EventSourceLike;
  // readonly CLOSED: number;
  // readonly CONNECTING: number;
  // readonly OPEN: number;
}
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

export type EventSourceConstructorLike2 = ConstructorOf<EventSourceLike>;

export type ListenerOf<T extends EventSourceLike> = Parameters<
  T['addEventListener']
>[1];
export type EventOf<T extends EventSourceLike> = Parameters<ListenerOf<T>>[0];

// type Test = EventOf<EventSourceLike>

// const es = new EventSource('asd');
// es.addEventListener('message', (ev) => {
//   ev.data;
// });
// es.addEventListener('error', (ev) => {
//   ev.data;
// });
