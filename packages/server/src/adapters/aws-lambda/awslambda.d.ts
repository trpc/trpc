import type { Writable } from 'node:stream';
import type { Context } from 'aws-lambda';

declare global {
  namespace awslambda {
    class HttpResponseStream extends Writable {
      static from(
        writable: Writable,
        metadata: Record<string, unknown>,
      ): HttpResponseStream;
      setContentType: (contentType: string) => void;
    }

    type StreamifyHandler<TEvent = any, TResult = any> = (
      event: TEvent,
      responseStream: awslambda.HttpResponseStream,
      context: Context,
    ) => TResult | Promise<TResult>;

    function streamifyResponse<TEvent = any, TResult = void>(
      handler: StreamifyHandler<TEvent, TResult>,
    ): StreamifyHandler<TEvent, TResult>;
  }
}
