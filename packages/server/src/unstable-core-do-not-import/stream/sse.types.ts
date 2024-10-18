export interface EventSourceInitLike {
  withCredentials?: boolean;
}

// defined as `type` to be compatible with typescript's lib.dom.d.ts

interface EventLike {}

type EventSourceListenerLike = (event: EventLike) => void;

export interface EventSourceConstructorLike<TInit extends EventSourceInitLike> {
  prototype: any;
  new (url: string, eventSourceInitDict?: TInit): EventSourceLike;
  // readonly CLOSED: number;
  // readonly CONNECTING: number;
  // readonly OPEN: number;
}

interface EventSourceLike {
  CLOSED: number;
  CONNECTING: number;
  OPEN: number;

  addEventListener(type: string, listener: EventSourceListenerLike): void;
  removeEventListener(type: string, listener: EventSourceListenerLike): void;
}
