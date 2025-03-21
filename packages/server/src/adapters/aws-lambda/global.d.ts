import type { Writable } from 'node:stream';

// Those types are made available globally by lambda's runtime
declare global {
  namespace awslambda {
    export namespace HttpResponseStream {
      function from(writable: Writable, metadata: ANY): Writable;
    }

    export type ResponseStream = Writable & {
      setContentType(type: string): void;
    };

    export type StreamifyHandler = (
      event: APIGatewayProxyEventV2,
      responseStream: ResponseStream,
      context: Context,
    ) => Promise<ANY>;

    export function streamifyResponse(
      handler: StreamifyHandler,
    ): Handler<APIGatewayProxyEventV2>;
  }
}
