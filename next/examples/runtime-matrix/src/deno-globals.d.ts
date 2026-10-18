/**
 * The few Deno APIs `deno.ts` uses, so `tsc` type-checks it without Deno
 * installed. Deno's own declarations (`deno check`) are the full ones.
 */
declare global {
  namespace Deno {
    const version: { readonly deno: string };
    const env: { get(key: string): string | undefined };
    interface Addr {
      readonly hostname: string;
      readonly port: number;
    }
    interface HttpServer {
      shutdown(): Promise<void>;
    }
    function serve(
      options: {
        port?: number;
        hostname?: string;
        onListen?: (addr: Addr) => void;
      },
      handler: (request: Request) => Response | Promise<Response>,
    ): HttpServer;
    function upgradeWebSocket(request: Request): {
      socket: WebSocket;
      response: Response;
    };
    function addSignalListener(signal: 'SIGTERM', handler: () => void): void;
  }
}

export {};
