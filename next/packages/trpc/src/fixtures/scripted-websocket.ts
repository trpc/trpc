const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Sent {
  id: number;
  type: string;
  path?: string;
  lastEventId?: string;
}

/** A WebSocket whose server side is the test: it sees what the link sends and delivers any frame. */
export class ScriptedWebSocket extends EventTarget {
  static opened: ScriptedWebSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  readonly sent: Sent[] = [];
  constructor(_url: string | URL) {
    super();
    ScriptedWebSocket.opened.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  receive(data: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data:
          typeof data === 'object' &&
          !(data instanceof ArrayBuffer) &&
          !(data instanceof Blob)
            ? JSON.stringify(data)
            : data,
      }),
    );
  }
  async request(path: string): Promise<Sent> {
    for (;;) {
      const found = this.sent.find(
        (m) => m.type === 'request' && m.path === path,
      );
      if (found) return found;
      await sleep(1);
    }
  }
}
