import type { Writable } from 'node:stream';
import type { Context, Handler } from 'aws-lambda';

declare global {
  namespace awslambda {
    export namespace HttpResponseStream {
      function from(
        writable: Writable,
        metadata: Record<string, unknown>,
      ): Writable;
    }

    export class ResponseStream extends Writable {
      setContentType: (contentType: string) => void;
    }

    export type StreamifyHandler<TEvent = unknown> = (
      event: TEvent,
      responseStream: ResponseStream,
      context: Context,
    ) => Promise<void>;

    export function streamifyResponse<TEvent = unknown>(
      handler: StreamifyHandler<TEvent>,
    ): StreamifyHandler<TEvent>;
  }
}
