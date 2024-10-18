export interface EventSourceInitEsque {
  withCredentials?: boolean;
}

// defined as `type` to be compatible with typescript's lib.dom.d.ts

export type EventSourceConstructorEsque<TInit extends EventSourceInitEsque> = {
  prototype: any;
  new (url: string, eventSourceInitDict?: TInit): EventSourceEsque;
  // readonly CLOSED: number;
  // readonly CONNECTING: number;
  // readonly OPEN: number;
};

interface EventSourceEsque {
  CLOSED: number;
  CONNECTING: number;
  OPEN: number;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
}
